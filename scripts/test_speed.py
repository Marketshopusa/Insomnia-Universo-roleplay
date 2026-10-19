import urllib.request
import json
import time
import base64

api_key = base64.b64decode("c2stb3ItdjEtNzNlMTQyNjhjZWFlZWNkY2E5ODQ3ZWExZTZhZTE2NGY0MWVlMWQzZTg5MGU0YTk0NjBmOTBhYTRmNjM1MmUyMg==").decode("utf-8")

models = [
    "anthracite-org/magnum-v4-72b",
    "cohere/command-r-plus-08-2024",
    "sao10k/l3.3-euryale-70b",
]

for m in models:
    t0 = time.time()
    try:
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            data=json.dumps({
                "model": m,
                "messages": [{"role": "user", "content": "Hola responde una sola palabra"}],
                "max_tokens": 10
            }).encode("utf-8")
        )
        with urllib.request.urlopen(req, timeout=15) as res:
            data = json.loads(res.read().decode("utf-8"))
            dt = time.time() - t0
            ans = data["choices"][0]["message"]["content"].strip()
            print(f"{m}: SUCCESS in {dt:.2f}s -> {ans}")
    except Exception as e:
        dt = time.time() - t0
        print(f"{m}: FAILED after {dt:.2f}s -> {e}")
