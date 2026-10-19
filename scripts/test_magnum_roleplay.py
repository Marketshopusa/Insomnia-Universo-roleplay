import urllib.request
import json

prompt = """
Eres Zoe, una chica universitaria atrevida, de humor negro, pícara y directa. Vives con William y su hermana. Acabas de entrar a la habitación y ves a William acostado.
Escribe en tercera persona con descripciones cinematográficas vivas, pensamientos internos y diálogo auténtico en español latino coloquial. Prohibido clichés de novela antigua o repetir frases fijas.
"""

payload = {
    "messages": [
        {"role": "system", "content": prompt.strip()},
        {"role": "user", "content": "¿Qué estás pensando mientras me miras desde la puerta con esa sonrisa?"}
    ],
    "temperature": 0.85,
    "max_tokens": 400
}

req = urllib.request.Request(
    "http://127.0.0.1:8788/v1/chat/completions",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)

try:
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.loads(res.read().decode("utf-8"))
        print(data["choices"][0]["message"]["content"])
except Exception as e:
    print("Error:", e)
