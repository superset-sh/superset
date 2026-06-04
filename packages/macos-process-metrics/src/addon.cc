#include <napi.h>

#ifdef __APPLE__
#include <libproc.h>
#endif

/**
 * getPhysFootprints(pids: number[]): Record<number, number>
 *
 * On macOS, calls proc_pid_rusage() for each PID and returns the
 * ri_phys_footprint value (the same "Memory" figure Activity Monitor
 * shows — compressed physical footprint).
 *
 * On other platforms the function compiles but returns an empty object,
 * so callers can fall back to RSS.
 */
Napi::Value GetPhysFootprints(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray()) {
        Napi::TypeError::New(env, "Expected an array of PIDs")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Array pidArray = info[0].As<Napi::Array>();
    Napi::Object result = Napi::Object::New(env);

#ifdef __APPLE__
    for (uint32_t i = 0; i < pidArray.Length(); i++) {
        Napi::Value val = pidArray[i];
        if (!val.IsNumber()) continue;

        pid_t pid = val.As<Napi::Number>().Int32Value();
        if (pid <= 0) continue;

        struct rusage_info_v4 ru;
        if (proc_pid_rusage(pid, RUSAGE_INFO_V4, (rusage_info_t *)&ru) == 0) {
            result.Set(
                static_cast<uint32_t>(pid),
                Napi::Number::New(env, static_cast<double>(ru.ri_phys_footprint))
            );
        }
    }
#endif

    return result;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("getPhysFootprints",
                Napi::Function::New(env, GetPhysFootprints));
    return exports;
}

NODE_API_MODULE(macos_process_metrics, Init)
