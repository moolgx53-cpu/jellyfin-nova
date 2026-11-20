using System;
using System.Collections.Generic;
using Jellyfin.Plugin.Nova.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.Nova;

/// <summary>
/// Main entry point for the Jellyfin Nova UI theme plugin.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>
    /// Fixed unique plugin identifier.
    /// </summary>
    public static readonly Guid PluginId = Guid.Parse("7d9a3e54-8b2c-4f1e-9a6d-3c5e8f1b2d4a");

    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
    /// </summary>
    /// <param name="applicationPaths">Jellyfin application paths.</param>
    /// <param name="xmlSerializer">XML serializer.</param>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
        var asmVersion = typeof(Plugin).Assembly.GetName().Version?.ToString() ?? "1.0.0.0";
        AssetVersion = asmVersion;
    }

    /// <summary>
    /// Gets the current plugin instance.
    /// </summary>
    public static Plugin? Instance { get; private set; }

    /// <summary>
    /// Gets the cache-busting asset version matching the compiled plugin version.
    /// </summary>
    public string AssetVersion { get; }

    /// <inheritdoc />
    public override string Name => "Jellyfin Nova";

    /// <inheritdoc />
    public override string Description => "Cinematic dark UI theme for Jellyfin with Spotlight Hero Banner, Top 10 row, enhanced Media Details, Library Hero Banners, and custom Video Player OSD.";

    /// <inheritdoc />
    public override Guid Id => PluginId;

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages()
    {
        return new[]
        {
            new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = $"{GetType().Namespace}.Configuration.configPage.html"
            }
        };
    }
}
