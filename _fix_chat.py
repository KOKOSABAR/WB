import re

with open('C:/Users/LILAI PC/Music/izin/index.html', encoding='utf-8') as f:
    content = f.read()

# Temukan chatView block (dari baris 2614 area)
start_marker = 'id="chatView"'
end_marker = '<!-- END CHAT VIEW -->'

start_idx = content.find(start_marker)
end_idx   = content.find(end_marker) + len(end_marker)

if start_idx == -1 or end_idx < len(end_marker):
    print("MARKERS NOT FOUND", start_idx, end_idx)
    exit(1)

# Expand start to include the preceding comment block
comment_start = content.rfind('\n    <!-- ===', 0, start_idx)
if comment_start == -1:
    comment_start = start_idx
actual_start = comment_start

chat_block = content[actual_start:end_idx]
print("chat_block length:", len(chat_block))

# Remove chat block from current position
before = content[:actual_start].rstrip('\n')
after  = content[end_idx:].lstrip('\n')
content_no_chat = before + '\n' + after

# Insert point: just before last </main> inside appShell
# The last </main> before </div></div> closing appShell
insert_marker = '            </main>\n        </div>\n    </div>'
insert_pos = content_no_chat.rfind(insert_marker)
print("insert_pos:", insert_pos)

if insert_pos == -1:
    print("INSERT MARKER NOT FOUND")
    exit(1)

final = (
    content_no_chat[:insert_pos] +
    '\n' + chat_block + '\n\n' +
    content_no_chat[insert_pos:]
)

with open('C:/Users/LILAI PC/Music/izin/index.html', 'w', encoding='utf-8') as f:
    f.write(final)

print("DONE - chatView moved inside main app-content")
