#!/bin/bash
# decode every saved Drive download into raw/<id>.mp4
S=/tmp/claude-0/-home-user-agent-visibility-template/f7c05a1a-ccab-545c-b525-ec2f69dcb0bf/scratchpad
for f in /root/.claude/projects/-home-user-agent-visibility-template/f7c05a1a-ccab-545c-b525-ec2f69dcb0bf/tool-results/mcp-Google_Drive-download_file_content-*.txt; do
  id=$(jq -r .id "$f" 2>/dev/null); [ -z "$id" -o "$id" = null ] && continue
  [ -s "$S/raw/$id.mp4" ] || jq -r .content "$f" | base64 -d > "$S/raw/$id.mp4"
done
ls $S/raw | wc -l
