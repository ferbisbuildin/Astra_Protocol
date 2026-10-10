const fs = require('fs');
const txt = fs.readFileSync('C:/Users/varda/.gemini/antigravity-ide/brain/1caaf1bc-0dd5-4909-94e8-cb3b798753a1/.system_generated/logs/transcript.jsonl', 'utf8');
const lines = txt.split('\n');
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes('SUBAGENT') || lines[i].includes('browser_subagent')) {
    console.log(lines[i].slice(0, 400));
    break;
  }
}
