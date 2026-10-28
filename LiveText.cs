using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.SceneManagement;

public class LiveText : MonoBehaviour
{
    [Header("Default text target (used when GameObject name is empty)")]
    public TextMesh uiText;
    public AudioSource voiceSource;

    [Header("Typing + Gradient")]
    public float typeSpeed = 0.05f;
    public float pauseAfterDone = 1.5f;
    public float duration = 2.5f;
    public float speed = 1.0f;
    public Color colorA = new Color(0.553f, 0.361f, 1.0f, 1.0f);
    public Color colorB = new Color(1.0f, 1.0f, 1.0f, 1.0f);

    [Header("Firebase")]
    string firebaseUrl = "https://my-text-1c7d9-default-rtdb.firebaseio.com/text.json";
    string activeUrl = "https://my-text-1c7d9-default-rtdb.firebaseio.com/active.json";
    float pollTime = 0.65f;

    readonly List<GameObject> currentEventObjs = new List<GameObject>();
    readonly List<string> currentEventPaths = new List<string>();
    string lastMessage = "";
    string lastTargetKey = "";
    private string currentRaw = "";
    private float timer = 0f;
    private Coroutine typeCoroutine;
    private Coroutine gradientCoroutine;
    TextTarget activeTarget;

    void Start()
    {
        if (voiceSource == null)
        {
            voiceSource = gameObject.AddComponent<AudioSource>();
            voiceSource.playOnAwake = false;
            voiceSource.spatialBlend = 0f;
        }

        if (uiText != null)
            activeTarget = TextTarget.FromComponent(uiText);

        StartCoroutine(PollFirebase());
        StartCoroutine(PublishActive());
    }

    IEnumerator PollFirebase()
    {
        while (true)
        {
            using (UnityWebRequest req = UnityWebRequest.Get(firebaseUrl))
            {
                yield return req.SendWebRequest();
                if (req.result == UnityWebRequest.Result.Success)
                {
                    string val = DecodeFirebase(req.downloadHandler.text);
                    HandleValue(val);
                }
                else
                {
                    Debug.LogWarning("firebase failed: " + req.error);
                }
            }
            yield return new WaitForSeconds(pollTime);
        }
    }

    void HandleValue(string val)
    {
        if (string.IsNullOrEmpty(val))
        {
            ClearEvents();
            StopTyping();
            if (activeTarget != null) activeTarget.SetText("");
            else if (uiText) uiText.text = "";
            lastMessage = "";
            lastTargetKey = "";
            StartCoroutine(PublishActive());
            return;
        }

        if (val.StartsWith("EVENT:"))
        {
            EnableEvent(val.Substring(6));
            StartCoroutine(PublishActive());
            return;
        }

        // TEXT:GameObjectName|message  → find that object and set its text
        if (val.StartsWith("TEXT:"))
        {
            string payload = val.Substring(5);
            int bar = payload.IndexOf('|');
            if (bar <= 0)
            {
                Debug.LogWarning("TEXT: needs GameObjectName|message  e.g. TEXT:MyLabel|hello");
                return;
            }

            string objectName = payload.Substring(0, bar).Trim();
            string message = payload.Substring(bar + 1);
            string key = objectName + "|" + message;

            if (key == lastTargetKey) return;
            lastTargetKey = key;
            lastMessage = message;

            TextTarget target = FindTextTarget(objectName);
            if (target == null)
            {
                Debug.LogWarning("no text component on GameObject: " + objectName);
                return;
            }

            StartTypingOn(target, message);
            StartCoroutine(SpeakIvy(message));
            return;
        }

        // plain message → default uiText
        if (val != lastMessage || lastTargetKey != "")
        {
            lastMessage = val;
            lastTargetKey = "";
            TextTarget target = uiText != null ? TextTarget.FromComponent(uiText) : null;
            if (target == null)
            {
                Debug.LogWarning("default uiText is not assigned");
                return;
            }
            StartTypingOn(target, val);
            StartCoroutine(SpeakIvy(val));
        }
    }

    TextTarget FindTextTarget(string objectName)
    {
        if (string.IsNullOrEmpty(objectName))
            return uiText != null ? TextTarget.FromComponent(uiText) : null;

        GameObject go = FindObjectByPath(objectName);
        if (go == null)
        {
            Debug.LogWarning("couldnt find GameObject: " + objectName);
            return null;
        }

        TextMesh tm = go.GetComponent<TextMesh>();
        if (tm == null) tm = go.GetComponentInChildren<TextMesh>(true);
        if (tm != null) return TextTarget.FromComponent(tm);

        TextTarget any = FindAnyTextOn(go);
        if (any != null) return any;

        foreach (Transform child in go.GetComponentsInChildren<Transform>(true))
        {
            if (child == go.transform) continue;
            any = FindAnyTextOn(child.gameObject);
            if (any != null) return any;
        }

        return null;
    }

    static TextTarget FindAnyTextOn(GameObject go)
    {
        string[] typeNames =
        {
            "TMPro.TextMeshProUGUI",
            "TMPro.TextMeshPro",
            "TextMeshProUGUI",
            "TextMeshPro",
            "UnityEngine.UI.Text",
            "Text"
        };

        Component[] comps = go.GetComponents<Component>();
        foreach (Component c in comps)
        {
            if (c == null) continue;
            string full = c.GetType().FullName ?? "";
            string name = c.GetType().Name;
            for (int i = 0; i < typeNames.Length; i++)
            {
                if (full == typeNames[i] || name == typeNames[i])
                    return TextTarget.FromComponent(c);
            }
            var prop = c.GetType().GetProperty("text", BindingFlags.Instance | BindingFlags.Public);
            if (prop != null && prop.CanWrite && prop.PropertyType == typeof(string) && !(c is Transform))
                return TextTarget.FromComponent(c);
        }
        return null;
    }

    void StartTypingOn(TextTarget target, string text)
    {
        StopTyping();
        activeTarget = target;
        currentRaw = text ?? "";
        timer = 0f;
        if (target != null) target.SetText("");
        typeCoroutine = StartCoroutine(TypeRoutine());
    }

    void StopTyping()
    {
        if (typeCoroutine != null) { StopCoroutine(typeCoroutine); typeCoroutine = null; }
        if (gradientCoroutine != null) { StopCoroutine(gradientCoroutine); gradientCoroutine = null; }
    }

    IEnumerator TypeRoutine()
    {
        for (int i = 1; i <= currentRaw.Length; i++)
        {
            if (currentRaw[i - 1] == '\n')
            {
                SetSweptText(currentRaw.Substring(0, i));
                continue;
            }
            float elapsed = 0f;
            while (elapsed < typeSpeed)
            {
                elapsed += Time.unscaledDeltaTime;
                timer += Time.unscaledDeltaTime * speed;
                SetSweptText(currentRaw.Substring(0, i));
                yield return null;
            }
        }

        float hold = 0f;
        while (hold < pauseAfterDone)
        {
            hold += Time.unscaledDeltaTime;
            timer += Time.unscaledDeltaTime * speed;
            SetSweptText(currentRaw);
            yield return null;
        }

        gradientCoroutine = StartCoroutine(KeepGradientAlive());
        typeCoroutine = null;
    }

    IEnumerator KeepGradientAlive()
    {
        while (true)
        {
            timer += Time.unscaledDeltaTime * speed;
            SetSweptText(currentRaw);
            yield return null;
        }
    }

    void SetSweptText(string input)
    {
        if (activeTarget == null) return;
        if (activeTarget.supportsRichColor)
            activeTarget.SetText(MakeSwept(input));
        else
            activeTarget.SetText(input);
    }

    string MakeSwept(string input)
    {
        if (string.IsNullOrEmpty(input)) return input;
        StringBuilder sb = new StringBuilder(input.Length * 20);
        for (int i = 0; i < input.Length; i++)
        {
            if (input[i] == '\n') { sb.Append('\n'); continue; }
            float offset = (timer / duration) - ((float)i / input.Length);
            float normalized = Mathf.Abs(Mathf.Repeat(offset, 1.0f) * 2.0f - 1.0f);
            Color c = Color.Lerp(colorA, colorB, normalized);
            sb.Append("<color=#");
            sb.Append(ColorUtility.ToHtmlStringRGB(c));
            sb.Append(">");
            sb.Append(input[i]);
            sb.Append("</color>");
        }
        return sb.ToString();
    }

    IEnumerator SpeakIvy(string text)
    {
        if (voiceSource != null && voiceSource.isPlaying)
            voiceSource.Stop();

        WWWForm form = new WWWForm();
        form.AddField("msg", text);
        form.AddField("lng", "Ivy");
        form.AddField("source", "ttsmp3");

        using (UnityWebRequest www = UnityWebRequest.Post("https://ttsmp3.com/makemp3.php", form))
        {
            www.SetRequestHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
            www.SetRequestHeader("Referer", "https://ttsmp3.com/");
            yield return www.SendWebRequest();

            if (www.result != UnityWebRequest.Result.Success)
            {
                Debug.LogWarning("tts failed: " + www.error);
                yield break;
            }

            string json = www.downloadHandler.text;
            string mp3 = GetUrlFromJson(json);
            if (string.IsNullOrEmpty(mp3))
            {
                Debug.LogWarning("no mp3 url found");
                yield break;
            }

            using (UnityWebRequest audio = UnityWebRequestMultimedia.GetAudioClip(mp3, AudioType.MPEG))
            {
                yield return audio.SendWebRequest();
                if (audio.result == UnityWebRequest.Result.Success)
                {
                    AudioClip clip = DownloadHandlerAudioClip.GetContent(audio);
                    if (clip != null && voiceSource != null)
                    {
                        voiceSource.clip = clip;
                        voiceSource.Play();
                    }
                }
            }
        }
    }

    string GetUrlFromJson(string json)
    {
        int start = json.IndexOf("\"URL\":\"");
        if (start == -1) return null;
        start += 7;
        int end = json.IndexOf("\"", start);
        if (end == -1) return null;
        return json.Substring(start, end - start).Replace("\\/", "/");
    }

    void EnableEvent(string payload)
    {
        if (string.IsNullOrEmpty(payload)) return;

        string[] rawParts = payload.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries);
        bool incremental = false;
        foreach (string raw in rawParts)
        {
            string p = raw.Trim();
            if (p.StartsWith("+") || p.StartsWith("-")) { incremental = true; break; }
        }

        if (incremental)
        {
            foreach (string raw in rawParts)
            {
                string p = raw.Trim();
                if (p.Length == 0) continue;
                if (p[0] == '+') AddEvent(p.Substring(1).Trim());
                else if (p[0] == '-') RemoveEvent(p.Substring(1).Trim());
                else AddEvent(p);
            }
        }
        else
        {
            List<string> wanted = new List<string>();
            foreach (string raw in rawParts)
            {
                string p = raw.Trim();
                if (p.Length > 0) wanted.Add(p);
            }
            ReplaceEvents(wanted);
        }
    }

    void ReplaceEvents(List<string> paths)
    {
        bool same = paths.Count == currentEventPaths.Count;
        if (same)
        {
            for (int i = 0; i < paths.Count; i++)
                if (paths[i] != currentEventPaths[i]) { same = false; break; }
        }

        if (!same)
        {
            ClearEvents();
            foreach (string p in paths) AddEvent(p);
            return;
        }

        for (int i = 0; i < currentEventObjs.Count; i++)
            if (currentEventObjs[i] != null) currentEventObjs[i].SetActive(true);
    }

    void AddEvent(string path)
    {
        if (string.IsNullOrEmpty(path)) return;
        int existing = currentEventPaths.IndexOf(path);
        if (existing != -1)
        {
            if (currentEventObjs[existing] != null) currentEventObjs[existing].SetActive(true);
            return;
        }

        GameObject found = FindObjectByPath(path);
        if (found == null)
        {
            Debug.LogWarning("couldnt find: " + path);
            return;
        }

        found.SetActive(true);
        currentEventPaths.Add(path);
        currentEventObjs.Add(found);
    }

    void RemoveEvent(string path)
    {
        int idx = currentEventPaths.IndexOf(path);
        if (idx == -1) return;
        if (currentEventObjs[idx] != null) currentEventObjs[idx].SetActive(false);
        currentEventPaths.RemoveAt(idx);
        currentEventObjs.RemoveAt(idx);
    }

    void ClearEvents()
    {
        for (int i = 0; i < currentEventObjs.Count; i++)
            if (currentEventObjs[i] != null) currentEventObjs[i].SetActive(false);
        currentEventObjs.Clear();
        currentEventPaths.Clear();
    }

    GameObject FindObjectByPath(string path)
    {
        if (string.IsNullOrEmpty(path)) return null;

        GameObject found = GameObject.Find(path);
        if (found != null) return found;

        GameObject[] allObjects = Resources.FindObjectsOfTypeAll<GameObject>();
        foreach (GameObject go in allObjects)
        {
            if (!go.scene.IsValid()) continue;
            if (go.name == path) return go;
        }

        if (path.Contains("/"))
        {
            string[] parts = path.Split('/');
            if (parts.Length == 0) return null;

            foreach (GameObject root in SceneManager.GetActiveScene().GetRootGameObjects())
            {
                if (root.name != parts[0]) continue;
                Transform t = root.transform;
                for (int i = 1; i < parts.Length; i++)
                {
                    if (string.IsNullOrEmpty(parts[i])) return null;
                    t = t.Find(parts[i]);
                    if (t == null) return null;
                }
                return t.gameObject;
            }

            foreach (GameObject go in allObjects)
            {
                if (!go.scene.IsValid()) continue;
                if (go.name != parts[0]) continue;
                Transform t = go.transform;
                bool ok = true;
                for (int i = 1; i < parts.Length; i++)
                {
                    if (string.IsNullOrEmpty(parts[i])) { ok = false; break; }
                    Transform child = null;
                    for (int c = 0; c < t.childCount; c++)
                    {
                        if (t.GetChild(c).name == parts[i]) { child = t.GetChild(c); break; }
                    }
                    if (child == null) { ok = false; break; }
                    t = child;
                }
                if (ok) return t.gameObject;
            }
        }

        return null;
    }

    IEnumerator PublishActive()
    {
        for (int i = currentEventObjs.Count - 1; i >= 0; i--)
        {
            if (currentEventObjs[i] == null)
            {
                currentEventObjs.RemoveAt(i);
                currentEventPaths.RemoveAt(i);
            }
        }

        string json = PathsToJsonArray(currentEventPaths);
        using (UnityWebRequest req = UnityWebRequest.Put(activeUrl, json))
        {
            req.SetRequestHeader("Content-Type", "application/json");
            yield return req.SendWebRequest();
            if (req.result != UnityWebRequest.Result.Success)
                Debug.LogWarning("publish active failed: " + req.error);
        }
    }

    static string PathsToJsonArray(List<string> paths)
    {
        StringBuilder sb = new StringBuilder();
        sb.Append('[');
        for (int i = 0; i < paths.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append('"');
            sb.Append(EscapeJson(paths[i]));
            sb.Append('"');
        }
        sb.Append(']');
        return sb.ToString();
    }

    static string EscapeJson(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    string DecodeFirebase(string json)
    {
        if (string.IsNullOrWhiteSpace(json) || json.Trim() == "null") return "";
        try
        {
            var wrapper = JsonUtility.FromJson<StringWrapper>("{\"value\":" + json + "}");
            return wrapper != null ? wrapper.value : "";
        }
        catch { return ""; }
    }

    [Serializable]
    class StringWrapper { public string value; }

    class TextTarget
    {
        public readonly Component component;
        public readonly bool supportsRichColor;
        readonly PropertyInfo textProp;
        readonly FieldInfo textField;

        TextTarget(Component c, bool rich)
        {
            component = c;
            supportsRichColor = rich;
            Type t = c.GetType();
            textProp = t.GetProperty("text", BindingFlags.Instance | BindingFlags.Public);
            if (textProp == null)
                textField = t.GetField("text", BindingFlags.Instance | BindingFlags.Public);
        }

        public static TextTarget FromComponent(Component c)
        {
            if (c == null) return null;
            bool rich = c is TextMesh;
            string name = c.GetType().Name;
            if (name.Contains("TextMeshPro") || name.Contains("TMP")) rich = true;
            return new TextTarget(c, rich);
        }

        public void SetText(string value)
        {
            if (component == null) return;
            try
            {
                if (textProp != null && textProp.CanWrite)
                    textProp.SetValue(component, value ?? "", null);
                else if (textField != null)
                    textField.SetValue(component, value ?? "");
                else if (component is TextMesh tm)
                    tm.text = value ?? "";
            }
            catch (Exception e)
            {
                Debug.LogWarning("failed to set text: " + e.Message);
            }
        }
    }
}
