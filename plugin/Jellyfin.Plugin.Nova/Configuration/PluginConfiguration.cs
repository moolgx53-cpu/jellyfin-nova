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
}
