import json
with open(r"C:\Users\Caique Amaral\.gemini\antigravity-ide\brain\d5d3e180-d4f9-4750-960b-878deaa757bf\.system_generated\steps\3199\content.md", "r", encoding="utf-8") as f:
    text = f.read()
    json_text = text.split("\n\n")[1].strip()
    data = json.loads(json_text)
    with open("station_count.txt", "w") as out:
        out.write(f"Count: {len(data)}\n")
