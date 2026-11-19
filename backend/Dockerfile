# syntax=docker/dockerfile:1
# Imagen del backend (API .NET 10). Contexto de build: la carpeta backend/.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Directory.Build.props ./
COPY TutoriaUNAS.Api/TutoriaUNAS.Api.csproj TutoriaUNAS.Api/packages.lock.json TutoriaUNAS.Api/
RUN dotnet restore TutoriaUNAS.Api/TutoriaUNAS.Api.csproj
COPY TutoriaUNAS.Api/ TutoriaUNAS.Api/
RUN dotnet publish TutoriaUNAS.Api/TutoriaUNAS.Api.csproj -c Release -o /app --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
# curl solo para el healthcheck del contenedor.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /keys && chown app:app /keys
WORKDIR /app
COPY --from=build --chown=app:app /app .
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_gcServer=0 \
    DOTNET_EnableDiagnostics=0
USER app
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
    CMD curl -fsS -H "X-Forwarded-Proto: https" http://localhost:8080/health/ready || exit 1
ENTRYPOINT ["dotnet", "TutoriaUNAS.Api.dll"]
