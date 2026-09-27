using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Winova.NetworkService;

internal static class Program
{
    private const string ServiceNameValue = "WinovaToolkitNetworkService";

    public static void Main(string[] args)
    {
        if (args.Contains("--console", StringComparer.OrdinalIgnoreCase))
        {
            using var service = new NetworkService();
            service.StartForConsole();
            Console.WriteLine("Winova network service is running. Press Enter to stop.");
            Console.ReadLine();
            service.StopForConsole();
            return;
        }

        ServiceBase.Run(new NetworkService { ServiceName = ServiceNameValue });
    }
}

internal sealed class NetworkService : ServiceBase
{
    private const string PipeName = "WinovaToolkitNetwork.v1";
    private CancellationTokenSource? cancellation;
    private Task? serverTask;

    public NetworkService()
    {
        CanStop = true;
        AutoLog = true;
    }

    protected override void OnStart(string[] args)
    {
        cancellation = new CancellationTokenSource();
        serverTask = RunServerAsync(cancellation.Token);
    }

    protected override void OnStop()
    {
        cancellation?.Cancel();
        try { serverTask?.Wait(TimeSpan.FromSeconds(5)); } catch { }
        cancellation?.Dispose();
    }

    public void StartForConsole() => OnStart([]);
    public void StopForConsole() => OnStop();

    private static NamedPipeServerStream CreatePipe()
    {
        var security = new PipeSecurity();
        security.AddAccessRule(new PipeAccessRule(
            new SecurityIdentifier(WellKnownSidType.AuthenticatedUserSid, null),
            PipeAccessRights.ReadWrite,
            AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(
            new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
            PipeAccessRights.FullControl,
            AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(
            new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null),
            PipeAccessRights.FullControl,
            AccessControlType.Allow));

        return NamedPipeServerStreamAcl.Create(
            PipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous | PipeOptions.WriteThrough,
            4096,
            4096,
            security);
    }

    private async Task RunServerAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            await using var pipe = CreatePipe();
            try
            {
                await pipe.WaitForConnectionAsync(token);
                await HandleClientAsync(pipe, token);
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested) { }
            catch { /* Keep the narrowly scoped broker available after malformed requests. */ }
        }
    }

    private static async Task HandleClientAsync(NamedPipeServerStream pipe, CancellationToken token)
    {
        await using var writer = new StreamWriter(pipe, new UTF8Encoding(false), 1024, true) { AutoFlush = true };
        using var reader = new StreamReader(pipe, Encoding.UTF8, false, 1024, true);

        if (!IsTrustedWinovaClient(pipe))
        {
            await writer.WriteLineAsync(JsonSerializer.Serialize(new Response(false, "Client verification failed"), ServiceJsonContext.Default.Response));
            return;
        }

        var input = await reader.ReadLineAsync(token);
        if (string.IsNullOrWhiteSpace(input) || input.Length > 4096)
        {
            await writer.WriteLineAsync(JsonSerializer.Serialize(new Response(false, "Invalid request"), ServiceJsonContext.Default.Response));
            return;
        }

        try
        {
            var request = JsonSerializer.Deserialize(input, ServiceJsonContext.Default.Request);
            if (request is null || request.Action is not ("getStatus" or "getDeviceIdentity" or "setAdapterState" or "restartAdapter" or "flushDns" or "renewDhcp"))
                throw new InvalidOperationException("Unsupported request");

            if (request.Action == "getStatus")
            {
                await writer.WriteLineAsync(JsonSerializer.Serialize(new Response(true, null, typeof(Program).Assembly.GetName().Version?.ToString(3)), ServiceJsonContext.Default.Response));
                return;
            }
            if (request.Action == "getDeviceIdentity")
            {
                const string identityScript = "$bios=Get-CimInstance Win32_BIOS -ErrorAction Stop|Select-Object -First 1;@{serial=$bios.SerialNumber}|ConvertTo-Json -Compress";
                var encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(identityScript));
                var data = await RunCommandCaptureAsync("WindowsPowerShell\\v1.0\\powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], token);
                await writer.WriteLineAsync(JsonSerializer.Serialize(new Response(true, null, null, data.Trim()), ServiceJsonContext.Default.Response));
                return;
            }

            if (request.Action is "setAdapterState" or "restartAdapter")
            {
                if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Length > 256) throw new InvalidOperationException("Invalid adapter name");
                var adapters = await ReadAdapterNamesAsync(token);
                if (!adapters.Contains(request.Name, StringComparer.Ordinal)) throw new InvalidOperationException("Network adapter was not found");
            }

            if (request.Action == "setAdapterState") await SetAdapterStateAsync(request.Name, request.Enabled, token);
            if (request.Action == "restartAdapter")
            {
                await SetAdapterStateAsync(request.Name, false, token);
                await Task.Delay(900, token);
                await SetAdapterStateAsync(request.Name, true, token);
            }
            if (request.Action == "flushDns") await RunCommandAsync("ipconfig.exe", ["/flushdns"], token);
            if (request.Action == "renewDhcp") await RunCommandAsync("ipconfig.exe", ["/renew"], token);

            await writer.WriteLineAsync(JsonSerializer.Serialize(new Response(true, null), ServiceJsonContext.Default.Response));
        }
        catch (Exception error)
        {
            await writer.WriteLineAsync(JsonSerializer.Serialize(new Response(false, error.Message), ServiceJsonContext.Default.Response));
        }
    }

    private static async Task SetAdapterStateAsync(string name, bool enabled, CancellationToken token)
    {
        // netsh can report success without changing the administrative state of
        // virtual adapters such as Tailscale. The NetAdapter cmdlets use the
        // native Windows adapter-management API and reliably handle both
        // physical and virtual adapters.
        const string script = "$adapter=Get-NetAdapter -Name $env:WINOVA_ADAPTER_NAME -IncludeHidden -ErrorAction Stop;"
            + "if($env:WINOVA_ADAPTER_ENABLED -eq 'true'){$adapter|Enable-NetAdapter -Confirm:$false -ErrorAction Stop}"
            + "else{$adapter|Disable-NetAdapter -Confirm:$false -ErrorAction Stop}";
        var encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
        var executable = Path.Combine(Environment.SystemDirectory, "WindowsPowerShell\\v1.0\\powershell.exe");
        var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = executable,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            }
        };
        process.StartInfo.Environment["WINOVA_ADAPTER_NAME"] = name;
        process.StartInfo.Environment["WINOVA_ADAPTER_ENABLED"] = enabled ? "true" : "false";
        foreach (var argument in new[] { "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded })
            process.StartInfo.ArgumentList.Add(argument);
        process.Start();
        var error = await process.StandardError.ReadToEndAsync(token);
        await process.WaitForExitAsync(token);
        if (process.ExitCode != 0)
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(error)
                ? "Windows did not change the network adapter state"
                : "Windows could not change this network adapter state");
    }

    private static async Task RunCommandAsync(string executable, string[] arguments, CancellationToken token)
    {
        var process = new Process { StartInfo = new ProcessStartInfo { FileName = Path.Combine(Environment.SystemDirectory, executable), UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true } };
        foreach (var argument in arguments) process.StartInfo.ArgumentList.Add(argument);
        process.Start();
        await process.WaitForExitAsync(token);
        if (process.ExitCode != 0) throw new InvalidOperationException("Windows did not complete the requested network action");
    }

    private static async Task<string> RunCommandCaptureAsync(string executable, string[] arguments, CancellationToken token)
    {
        var process = new Process { StartInfo = new ProcessStartInfo { FileName = Path.Combine(Environment.SystemDirectory, executable), UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true } };
        foreach (var argument in arguments) process.StartInfo.ArgumentList.Add(argument);
        process.Start();
        var output = await process.StandardOutput.ReadToEndAsync(token);
        await process.WaitForExitAsync(token);
        if (process.ExitCode != 0) throw new InvalidOperationException("Windows device information is unavailable");
        return output;
    }

    private static async Task<HashSet<string>> ReadAdapterNamesAsync(CancellationToken token)
    {
        var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = Path.Combine(Environment.SystemDirectory, "netsh.exe"),
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true
            }
        };
        process.StartInfo.ArgumentList.Add("interface");
        process.StartInfo.ArgumentList.Add("show");
        process.StartInfo.ArgumentList.Add("interface");
        process.Start();
        var output = await process.StandardOutput.ReadToEndAsync(token);
        await process.WaitForExitAsync(token);
        var names = new HashSet<string>(StringComparer.Ordinal);
        foreach (var line in output.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
        {
            var columns = System.Text.RegularExpressions.Regex.Match(line, @"^\s*(Enabled|Disabled)\s+(Connected|Disconnected)\s+\S+\s+(.+?)\s*$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (columns.Success) names.Add(columns.Groups[3].Value);
        }
        return names;
    }

    private static bool IsTrustedWinovaClient(NamedPipeServerStream pipe)
    {
        if (!GetNamedPipeClientProcessId(pipe.SafePipeHandle.DangerousGetHandle(), out var processId)) return false;
        try
        {
            using var process = Process.GetProcessById((int)processId);
            var actualPath = Path.GetFullPath(process.MainModule?.FileName ?? string.Empty);
            var expectedPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "Winova Toolkit.exe"));
            return string.Equals(actualPath, expectedPath, StringComparison.OrdinalIgnoreCase);
        }
        catch { return false; }
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetNamedPipeClientProcessId(IntPtr pipe, out uint clientProcessId);

}

internal sealed record Request(string Action, string Name, bool Enabled);
internal sealed record Response(bool Ok, string? Error, string? Version = null, string? Data = null);

[JsonSerializable(typeof(Request))]
[JsonSerializable(typeof(Response))]
internal partial class ServiceJsonContext : JsonSerializerContext;
