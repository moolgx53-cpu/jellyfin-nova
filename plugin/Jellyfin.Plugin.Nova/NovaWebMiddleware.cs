using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Nova;

/// <summary>
/// Serves Jellyfin Nova's embedded web assets and injects Nova into Jellyfin's index.html in memory
/// without modifying any files on disk.
/// </summary>
public class NovaWebMiddleware
{
    private const string ResourcePrefix = "Jellyfin.Plugin.Nova.Assets.";

    private static readonly string[] AssetPrefixes = { "/web/ui/", "/web/nova/", "/NovaUI/" };

    private static readonly Dictionary<string, string> AssetContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["abyss.css"] = "text/css; charset=utf-8",
        ["library-banner.css"] = "text/css; charset=utf-8",
        ["library-banner.js"] = "application/javascript; charset=utf-8",
        ["movie-details.css"] = "text/css; charset=utf-8",
        ["movie-details.js"] = "application/javascript; charset=utf-8",
        ["abyss-state.js"] = "application/javascript; charset=utf-8",
        ["nova-boot.js"] = "application/javascript; charset=utf-8",
        ["spotlight.html"] = "text/html; charset=utf-8",
        ["spotlight.css"] = "text/css; charset=utf-8"
    };

    private sealed record AssetEntry(byte[] Raw, byte[] Gzip, byte[] Brotli, string ETag);

    private static readonly ConcurrentDictionary<string, AssetEntry?> CachedAssets = new(StringComparer.OrdinalIgnoreCase);

    private static volatile string? _cachedVersionKey;
    private static volatile byte[]? _cachedVersionBytes;

    private static readonly Regex LegacyAssetTagRegex = new(
        @"<(?:link[^>]+href=[""']ui/(?:abyss|library-banner|movie-details)\.css[^""']*[""'][^>]*>|script[^>]+src=[""']ui/(?:library-banner|movie-details|abyss-state|nova-boot)\.js[^""']*[""'][^>]*>\s*</script>)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex SpotlightCssHrefRegex = new(
        @"spotlight\.css(?:\?v=[^""']*)?",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private const string HeadPreloadSnippet = """
    <script>
        try {
            var isJmp = !!(window.jmpInfo || (navigator.userAgent && /JellyfinMediaPlayer/i.test(navigator.userAgent)) || (window.api && window.api.player));
            if (isJmp) {
                document.documentElement.classList.add('is-jmp-app');
            } else {
                document.documentElement.classList.add('is-web-browser');
            }
        } catch(e){}
    </script>
    <style>
        html:not(.is-jmp-app),
        html:not(.is-jmp-app) body {
            background-color: #000000 !important;
        }
        .is-jmp-app .backgroundContainer-transparent:not(.withBackdrop),
        .is-jmp-app.transparentDocument {
            background: 0 0 !important;
            background-color: transparent !important;
        }
    </style>
""";

    private readonly RequestDelegate _next;
    private readonly ILogger<NovaWebMiddleware> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="NovaWebMiddleware"/> class.
    /// </summary>
    /// <param name="next">The next middleware in the pipeline.</param>
    /// <param name="logger">Logger instance.</param>
    public NovaWebMiddleware(RequestDelegate next, ILogger<NovaWebMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    /// <summary>
    /// Processes incoming HTTP requests.
    /// </summary>
    /// <param name="context">Current HTTP context.</param>
    /// <returns>A task representing the asynchronous operation.</returns>
    public Task InvokeAsync(HttpContext context)
    {
        var plugin = Plugin.Instance;
        var config = plugin?.Configuration;
        if (plugin is null || config is null || !config.Enabled)
        {
            return _next(context);
        }

        var path = context.Request.Path.Value;
        if (string.IsNullOrEmpty(path)
            || (path.IndexOf("/web", StringComparison.OrdinalIgnoreCase) < 0
                && path.IndexOf("/NovaUI", StringComparison.OrdinalIgnoreCase) < 0))
        {
            return _next(context);
        }

        var method = context.Request.Method;
        var isGetOrHead = HttpMethods.IsGet(method) || HttpMethods.IsHead(method);

        // 1. Serve embedded Nova assets under /web/ui/{file}, /web/nova/{file}, or /NovaUI/{file}
        if (isGetOrHead && TryExtractAssetFileName(path, out var fileName))
        {
            return ServeEmbeddedAssetAsync(context, plugin, fileName, method);
        }

        // 2. Intercept Jellyfin Web index.html and inject Nova scripts & styles in memory
        if (HttpMethods.IsGet(method) && IsWebIndexRequest(path))
        {
            return HandleIndexHtmlInjectionAsync(context, plugin);
        }

        return _next(context);
    }

    private static async Task ServeEmbeddedAssetAsync(HttpContext context, Plugin plugin, string fileName, string method)
    {
        var config = plugin.Configuration;
        if (fileName.Equals("version.json", StringComparison.OrdinalIgnoreCase))
        {
            var verKey = $"{plugin.AssetVersion}:{config.EnableSpotlight}:{config.ForceDarkTheme}";
            var payload = _cachedVersionBytes;
            if (payload is null || !string.Equals(_cachedVersionKey, verKey, StringComparison.Ordinal))
            {
                var versionJson = $"{{\"version\":\"{plugin.AssetVersion}\",\"enableSpotlight\":{(config.EnableSpotlight ? "true" : "false")},\"forceDarkTheme\":{(config.ForceDarkTheme ? "true" : "false")}}}";
                payload = Encoding.UTF8.GetBytes(versionJson);
                _cachedVersionBytes = payload;
                _cachedVersionKey = verKey;
            }

            context.Response.StatusCode = StatusCodes.Status200OK;
            context.Response.ContentType = "application/json; charset=utf-8";
            context.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
            context.Response.ContentLength = payload.Length;
            if (HttpMethods.IsGet(method))
            {
                await context.Response.Body.WriteAsync(payload).ConfigureAwait(false);
            }

            return;
        }

        if (!AssetContentTypes.TryGetValue(fileName, out var contentType))
        {
            return;
        }

        var entry = GetEmbeddedAssetEntry(fileName, plugin.AssetVersion);
        if (entry is null)
        {
            return;
        }

        context.Response.Headers["ETag"] = entry.ETag;
        context.Response.Headers["Vary"] = "Accept-Encoding";
        context.Response.Headers["Cache-Control"] = context.Request.Query.ContainsKey("v")
            ? "public, max-age=31536000, immutable"
            : "no-cache";

        var ifNoneMatch = context.Request.Headers.IfNoneMatch.ToString();
        if (!string.IsNullOrEmpty(ifNoneMatch) && ifNoneMatch.Contains(entry.ETag, StringComparison.Ordinal))
        {
            context.Response.StatusCode = StatusCodes.Status304NotModified;
            return;
        }

        var acceptEncoding = context.Request.Headers.AcceptEncoding.ToString();
        byte[] responseBytes;
        string? contentEncoding = null;
        if (acceptEncoding.Contains("br", StringComparison.OrdinalIgnoreCase) && entry.Brotli.Length < entry.Raw.Length)
        {
            responseBytes = entry.Brotli;
            contentEncoding = "br";
        }
        else if (acceptEncoding.Contains("gzip", StringComparison.OrdinalIgnoreCase) && entry.Gzip.Length < entry.Raw.Length)
        {
            responseBytes = entry.Gzip;
            contentEncoding = "gzip";
        }
        else
        {
            responseBytes = entry.Raw;
        }

        context.Response.StatusCode = StatusCodes.Status200OK;
        context.Response.ContentType = contentType;
        if (contentEncoding is not null)
        {
            context.Response.Headers["Content-Encoding"] = contentEncoding;
        }

        context.Response.ContentLength = responseBytes.Length;
        if (HttpMethods.IsGet(method))
        {
            await context.Response.Body.WriteAsync(responseBytes).ConfigureAwait(false);
        }
    }

    private static bool TryExtractAssetFileName(string path, out string fileName)
    {
        fileName = string.Empty;

        foreach (var prefix in AssetPrefixes)
        {
            var idx = path.IndexOf(prefix, StringComparison.OrdinalIgnoreCase);
            if (idx >= 0)
            {
                var candidate = path.Substring(idx + prefix.Length);
                if (!string.IsNullOrEmpty(candidate) && !candidate.Contains('/') && !candidate.Contains('\\'))
                {
                    if (candidate.Equals("version.json", StringComparison.OrdinalIgnoreCase)
                        || AssetContentTypes.ContainsKey(candidate))
                    {
                        fileName = candidate;
                        return true;
                    }
                }
            }
        }

        return false;
    }

    private static bool IsWebIndexRequest(string path)
    {
        return path.Equals("/web/index.html", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith("/web/index.html", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web/", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith("/web/", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith("/web", StringComparison.OrdinalIgnoreCase);
    }

    private static AssetEntry? GetEmbeddedAssetEntry(string fileName, string assetVersion)
    {
        var cacheKey = $"{fileName}:{assetVersion}";
        return CachedAssets.GetOrAdd(cacheKey, _ =>
        {
            var assembly = typeof(NovaWebMiddleware).Assembly;
            var resourceName = ResourcePrefix + fileName;
            using var stream = assembly.GetManifestResourceStream(resourceName);
            if (stream is null)
            {
                return null;
            }

            byte[] raw;
            if (fileName.Equals("spotlight.html", StringComparison.OrdinalIgnoreCase))
            {
                using var reader = new StreamReader(stream, Encoding.UTF8);
                var html = reader.ReadToEnd();
                html = SpotlightCssHrefRegex.Replace(html, $"spotlight.css?v={assetVersion}");
                raw = Encoding.UTF8.GetBytes(html);
            }
            else
            {
                using var ms = new MemoryStream();
                stream.CopyTo(ms);
                raw = ms.ToArray();
            }

            if (raw.Length == 0)
            {
                return null;
            }

            byte[] gzip;
            using (var gzOut = new MemoryStream())
            {
                using (var gz = new GZipStream(gzOut, CompressionLevel.Optimal, leaveOpen: true))
                {
                    gz.Write(raw, 0, raw.Length);
                }

                gzip = gzOut.ToArray();
            }

            byte[] brotli;
            using (var brOut = new MemoryStream())
            {
                using (var br = new BrotliStream(brOut, CompressionLevel.Optimal, leaveOpen: true))
                {
                    br.Write(raw, 0, raw.Length);
                }

                brotli = brOut.ToArray();
            }

            var hashBytes = SHA256.HashData(raw);
            var etag = $"\"{Convert.ToHexString(hashBytes, 0, 8)}-{assetVersion}\"";
            return new AssetEntry(raw, gzip, brotli, etag);
        });
    }

    private async Task HandleIndexHtmlInjectionAsync(HttpContext context, Plugin plugin)
    {
        var clientAcceptEncoding = context.Request.Headers.AcceptEncoding.ToString();

        // Request uncompressed fresh response from downstream static file middleware
        context.Request.Headers.Remove("Accept-Encoding");
        context.Request.Headers.Remove("If-None-Match");
        context.Request.Headers.Remove("If-Modified-Since");

        var originalBody = context.Response.Body;
        await using var buffer = new MemoryStream();
        context.Response.Body = buffer;

        try
        {
            await _next(context).ConfigureAwait(false);

            buffer.Seek(0, SeekOrigin.Begin);

            var contentType = context.Response.ContentType ?? string.Empty;
            if (context.Response.StatusCode != StatusCodes.Status200OK
                || !contentType.Contains("text/html", StringComparison.OrdinalIgnoreCase))
            {
                context.Response.Body = originalBody;
                if (buffer.Length > 0)
                {
                    await buffer.CopyToAsync(originalBody).ConfigureAwait(false);
                }

                return;
            }

            string html = await ReadResponseTextAsync(buffer, context.Response.Headers["Content-Encoding"].ToString()).ConfigureAwait(false);

            if (!html.Contains("</body>", StringComparison.OrdinalIgnoreCase))
            {
                var rawBytes = Encoding.UTF8.GetBytes(html);
                context.Response.Body = originalBody;
                context.Response.Headers.Remove("Content-Encoding");
                context.Response.ContentLength = rawBytes.Length;
                await originalBody.WriteAsync(rawBytes).ConfigureAwait(false);
                return;
            }

            var modifiedHtml = InjectNovaMarkup(html, plugin);
            var modifiedBytes = Encoding.UTF8.GetBytes(modifiedHtml);

            byte[] outBytes = modifiedBytes;
            string? outEncoding = null;
            if (clientAcceptEncoding.Contains("br", StringComparison.OrdinalIgnoreCase))
            {
                using var brOut = new MemoryStream();
                await using (var br = new BrotliStream(brOut, CompressionLevel.Fastest, leaveOpen: true))
                {
                    await br.WriteAsync(modifiedBytes).ConfigureAwait(false);
                }

                outBytes = brOut.ToArray();
                outEncoding = "br";
            }
            else if (clientAcceptEncoding.Contains("gzip", StringComparison.OrdinalIgnoreCase))
            {
                using var gzOut = new MemoryStream();
                await using (var gz = new GZipStream(gzOut, CompressionLevel.Fastest, leaveOpen: true))
                {
                    await gz.WriteAsync(modifiedBytes).ConfigureAwait(false);
                }

                outBytes = gzOut.ToArray();
                outEncoding = "gzip";
            }

            context.Response.Body = originalBody;
            context.Response.Headers.Remove("Content-Encoding");
            if (outEncoding is not null)
            {
                context.Response.Headers["Content-Encoding"] = outEncoding;
                context.Response.Headers["Vary"] = "Accept-Encoding";
            }

            context.Response.Headers.Remove("ETag");
            context.Response.Headers.Remove("Last-Modified");
            context.Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
            context.Response.ContentLength = outBytes.Length;

            await originalBody.WriteAsync(outBytes).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Jellyfin Nova failed to inject web assets into index.html.");
            context.Response.Body = originalBody;
            if (buffer.Length > 0 && !context.Response.HasStarted)
            {
                buffer.Seek(0, SeekOrigin.Begin);
                await buffer.CopyToAsync(originalBody).ConfigureAwait(false);
            }
        }
        finally
        {
            context.Response.Body = originalBody;
        }
    }

    private static async Task<string> ReadResponseTextAsync(MemoryStream buffer, string contentEncoding)
    {
        Stream readStream = buffer;
        if (contentEncoding.Contains("gzip", StringComparison.OrdinalIgnoreCase))
        {
            readStream = new GZipStream(buffer, CompressionMode.Decompress, leaveOpen: true);
        }
        else if (contentEncoding.Contains("br", StringComparison.OrdinalIgnoreCase))
        {
            readStream = new BrotliStream(buffer, CompressionMode.Decompress, leaveOpen: true);
        }
        else if (contentEncoding.Contains("deflate", StringComparison.OrdinalIgnoreCase))
        {
            readStream = new DeflateStream(buffer, CompressionMode.Decompress, leaveOpen: true);
        }

        using var reader = new StreamReader(readStream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: true);
        var text = await reader.ReadToEndAsync().ConfigureAwait(false);
        if (!ReferenceEquals(readStream, buffer))
        {
            await readStream.DisposeAsync().ConfigureAwait(false);
        }

        return text;
    }

    private static string InjectNovaMarkup(string html, Plugin plugin)
    {
        var ver = plugin.AssetVersion;
        var config = plugin.Configuration;
        var enableSpotlight = config.EnableSpotlight ? "true" : "false";
        var forceDarkTheme = config.ForceDarkTheme ? "true" : "false";

        // Strip any legacy manual setup tags so nothing loads twice
        html = LegacyAssetTagRegex.Replace(html, string.Empty);

        // Inject JMP/Web detection + dark preload styles into <head> if not already present
        if (!html.Contains("is-jmp-app", StringComparison.OrdinalIgnoreCase))
        {
            var headCloseIndex = html.LastIndexOf("</head>", StringComparison.OrdinalIgnoreCase);
            if (headCloseIndex >= 0)
            {
                html = html.Insert(headCloseIndex, HeadPreloadSnippet + "\n");
            }
        }

        var bodySnippet =
            "\n    <!-- Jellyfin Nova Plugin Start -->\n" +
            $"    <script>window.__NOVA_CONFIG__={{\"version\":\"{ver}\",\"enableSpotlight\":{enableSpotlight},\"forceDarkTheme\":{forceDarkTheme}}};</script>\n" +
            $"    <link rel=\"stylesheet\" href=\"ui/abyss.css?v={ver}\">\n" +
            $"    <link rel=\"stylesheet\" href=\"ui/library-banner.css?v={ver}\">\n" +
            $"    <link rel=\"stylesheet\" href=\"ui/movie-details.css?v={ver}\">\n" +
            $"    <script src=\"ui/nova-boot.js?v={ver}\" defer></script>\n" +
            $"    <script src=\"ui/library-banner.js?v={ver}\" defer></script>\n" +
            $"    <script src=\"ui/movie-details.js?v={ver}\" defer></script>\n" +
            $"    <script src=\"ui/abyss-state.js?v={ver}\" defer></script>\n" +
            "    <!-- Jellyfin Nova Plugin End -->\n";

        var bodyCloseIndex = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
        if (bodyCloseIndex >= 0)
        {
            html = html.Insert(bodyCloseIndex, bodySnippet);
        }

        return html;
    }
}
