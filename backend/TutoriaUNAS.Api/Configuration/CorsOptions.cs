namespace TutoriaUNAS.Api.Configuration;

public sealed class CorsOptions
{
    public const string SectionName = "Cors";
    public string[] AllowedOrigins { get; init; } = [];

    public bool IsValid() => AllowedOrigins.Length > 0 && AllowedOrigins.All(origin =>
        Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
        (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps) &&
        uri.UserInfo.Length == 0 && uri.PathAndQuery == "/" && uri.Fragment.Length == 0 &&
        !origin.EndsWith('/') && !origin.Contains('*', StringComparison.Ordinal));
}
