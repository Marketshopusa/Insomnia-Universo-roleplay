import urllib.request
import json
import base64

api_key = base64.b64decode("c2stb3ItdjEtNzNlMTQyNjhjZWFlZWNkY2E5ODQ3ZWExZTZhZTE2NGY0MWVlMWQzZTg5MGU0YTk0NjBmOTBhYTRmNjM1MmUyMg==").decode("utf-8")

user_msg = (
    "Mientras ella me ve y me habla, los dos nos miramos con lujuria, yo miro su suave y sexy ropa apretadita. "
    "Mi cerebro ya estaba pensando ir más allá y al parecer ella también estaba dispuesta. "
    "Justo cuando voy a dar un paso al frente y ella está esperando ver qué voy a hacer de pronto se escucha la camioneta de su mamá llegando. "
    "«Rayos, sal llegó tu mamá y yo en toalla, o mejor dicho, con la toalla en el piso. Voy a ir al cuarto a vestirme, tu mamá no debe conseguirme así». "
    "Ella sale a recibir a su mamá y ayudarla a bajar las cosas de la camioneta mientras yo me visto rápidamente. "
    "Cuando mi hermana entra ya yo estaba vestido saliendo de la habitación, ella salta sobre mí emocionada y me abraza."
)

directive = (
    "[ESCENA MULTI-PERSONAJE / DIRECTOR: En este turno quien entra y salta sobre el usuario para abrazarlo es su HERMANA (la mamá de Maya). "
    "La hermana llama al usuario 'hermano' o 'hermanito' (NUNCA 'tío'). "
    "PROHIBIDO que Maya responda en primera persona diciendo 'Tío... cuánto te extrañé'. "
    "Narra el abrazo y efusividad de la hermana, y cómo Maya entra detrás observando.]\n" + user_msg
)

payload = {
    'model': 'anthracite-org/magnum-v4-72b',
    'messages': [
        {
            'role': 'system',
            'content': (
                "Eres un actor y narrador de roleplay inmersivo para adultos al estilo Momoo AI. "
                "El usuario es el Director y protagonista. "
                "REPARTO: Maya (sobrina del usuario) y personajes secundarios como la hermana del usuario (mamá de Maya). "
                "Puedes interpretar a cualquiera de los personajes presentes o narrar sus interacciones conjuntas. "
                "Respeta estrictamente los parentescos reales de cada personaje con el usuario."
            )
        },
        {
            'role': 'user',
            'content': directive
        }
    ],
    'max_tokens': 350,
    'temperature': 0.85
}

req = urllib.request.Request(
    'https://openrouter.ai/api/v1/chat/completions',
    headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
    data=json.dumps(payload).encode('utf-8')
)

try:
    with urllib.request.urlopen(req, timeout=25) as res:
        out = json.loads(res.read().decode('utf-8'))
        print("RESULT:")
        print(out['choices'][0]['message']['content'])
except Exception as e:
    print("Error:", e)
