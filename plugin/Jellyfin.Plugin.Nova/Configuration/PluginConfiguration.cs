using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Nova.Configuration;

/// <summary>
/// Configuration options for Jellyfin Nova.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets a value indicating whether Jellyfin Nova UI injection is enabled.
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the Home Spotlight Hero &amp; Top 10 banner is enabled.
    /// </summary>
    public bool EnableSpotlight { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether dark theme should be enforced for all web clients.
    /// </summary>
    public bool ForceDarkTheme { get; set; } = true;

    /// <summary>
    /// Gets or sets the theme accent color in #RRGGBB hex format.
    /// </summary>
    public string AccentColor { get; set; } = "#00d26a";

    /// <summary>
    /// Gets or sets a value indicating whether the Top 10 row in the Home Spotlight is enabled.
    /// </summary>
    public bool EnableTop10Row { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether hover trailer previews on cards are enabled.
    /// </summary>
    public bool EnableHoverTrailers { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the Library Hero Banner is enabled.
    /// </summary>
    public bool EnableLibraryBanner { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the custom Nova Video Player OSD bar is enabled.
    /// </summary>
    public bool EnableCustomVideoOsd { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether background Hero Theme Video playback is enabled on details pages.
    /// </summary>
    public bool EnableHeroThemeVideo { get; set; } = true;

    /// <summary>
    /// Gets or sets the Spotlight content source: latest, random, toprated, or collection.
    /// </summary>
    public string SpotlightSource { get; set; } = "latest";

    /// <summary>
    /// Gets or sets the selected Collection/Playlist Id when <see cref="SpotlightSource"/> is collection.
    /// </summary>
    public string SpotlightCollectionId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the performance / lite mode: off, auto, or on.
    /// </summary>
    public string PerformanceMode { get; set; } = "off";
}
