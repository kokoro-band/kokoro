using System;
using UnityEngine;

namespace Kokoro.Runtime
{
    [Serializable]
    public sealed class RuntimeContext
    {
        public string apiBaseUrl = string.Empty;
        public string webSocketUrl = string.Empty;
        public string accessToken = string.Empty;
        public string spaceId = string.Empty;
        public string reservationId = string.Empty;
    }

    public sealed class AppBootstrap : MonoBehaviour
    {
        public static AppBootstrap Instance { get; private set; }

        public RuntimeContext Context { get; private set; }

        public event Action<RuntimeContext> ContextReceived;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        public void ReceiveContext(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                Debug.LogError("Runtime context is empty.");
                return;
            }

            RuntimeContext nextContext = JsonUtility.FromJson<RuntimeContext>(json);
            if (nextContext == null || string.IsNullOrWhiteSpace(nextContext.spaceId))
            {
                Debug.LogError("Runtime context is invalid.");
                return;
            }

            Context = nextContext;
            ContextReceived?.Invoke(nextContext);
            BrowserBridge.Emit("unity:ready", nextContext.spaceId);
        }
    }
}
