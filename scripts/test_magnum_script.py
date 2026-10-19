import urllib.request
import json

payload = {
    "messages": [
        {"role": "system", "content": "Eres un guionista de miniseries audiovisuales. Devuelve solo un JSON con 'title' y 'chapters' (3 capitulos, cada uno con 'visual' y 'dialogue')."},
        {"role": "user", "content": "Idea: Dos amantes que se encuentran en un hotel para tener sexo apasionado."}
    ],
    "temperature": 0.7,
    "max_tokens": 500,
    "response_format": {"type": "json_object"}
}

req = urllib.request.Request(
    "http://127.0.0.1:8788/v1/chat/completions",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)

try:
    with urllib.request.urlopen(req, timeout=15) as res:
        data = json.loads(res.read().decode("utf-8"))
        print(data["choices"][0]["message"]["content"])
except Exception as e:
    print("Error:", e)
