import json
with open(r"C:\Users\Caique Amaral\.gemini\antigravity-ide\brain\d5d3e180-d4f9-4750-960b-878deaa757bf\.system_generated\steps\3133\content.md", "r", encoding="utf-8") as f:
    text = f.read()
    # Strip first lines
    json_text = text.split("\n\n")[1].strip()
    data = json.loads(json_text)
    print(f"Total stations: {len(data)}")
    for key, val in data[0].items():
        print(f"Key {key}: type {type(val)}, length {len(str(val))}")
