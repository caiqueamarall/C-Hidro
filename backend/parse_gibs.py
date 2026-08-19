import re

with open(r"C:\Users\Caique Amaral\.gemini\antigravity-ide\brain\d5d3e180-d4f9-4750-960b-878deaa757bf\.system_generated\steps\2035\content.md", "r", encoding="utf-8") as f:
    text = f.read()

layers = re.findall(r'<Name>([^<]+)</Name>', text)
precip_layers = [l for l in layers if 'precip' in l.lower() or 'gpm' in l.lower() or 'imerg' in l.lower()]
with open(r"C:\Users\Caique Amaral\.gemini\antigravity-ide\brain\d5d3e180-d4f9-4750-960b-878deaa757bf\scratch\gibs_layers.txt", "w", encoding="utf-8") as out:
    out.write("\n".join(set(precip_layers)))
