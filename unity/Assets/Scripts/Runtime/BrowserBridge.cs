using System.Runtime.InteropServices;
using UnityEngine;

namespace Kokoro.Runtime
{
    public static class BrowserBridge
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void KokoroDispatchToBrowser(string eventName, string payload);
#endif

        public static void Emit(string eventName, string payload)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            KokoroDispatchToBrowser(eventName, payload);
#else
            Debug.Log($"Browser event: {eventName} ({payload})");
#endif
        }
    }
}
