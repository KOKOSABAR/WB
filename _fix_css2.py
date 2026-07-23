with open('C:/Users/LILAI PC/Music/izin/style.css', encoding='utf-8') as f:
    content = f.read()

OLD = '''/* ---- MESSAGE BUBBLES ---- */
.chat-msg-wrapper {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    max-width: 75%;
}

.chat-msg-me {
    align-self: flex-end;
    flex-direction: row-reverse;
}

.chat-msg-other {
    align-self: flex-start;
}

.chat-msg-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    flex-shrink: 0;
    overflow: hidden;
}

.chat-msg-avatar-initials {
    background: linear-gradient(135deg, var(--primary), var(--accent));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    font-weight: 800;
    color: #fff;
}

.chat-msg-bubble {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 100%;
}

.chat-msg-me .chat-msg-bubble > * {
    align-self: flex-end;
}

.chat-msg-sender {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 2px;
    padding-left: 2px;
}

.chat-msg-text {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px 14px 14px 4px;
    padding: 9px 13px;
    font-size: 0.83rem;
    line-height: 1.5;
    color: var(--text-main);
    word-break: break-word;
    max-width: 420px;
}

.chat-msg-me .chat-msg-text {
    background: rgba(139,92,246,0.2);
    border-color: rgba(139,92,246,0.3);
    border-radius: 14px 14px 4px 14px;
}

.chat-msg-image {
    max-width: 280px;
    max-height: 240px;
    border-radius: 12px;
    cursor: zoom-in;
    object-fit: cover;'''

NEW = '''/* ---- MESSAGE BUBBLES (base — overridden by UPGRADE block) ---- */
.chat-msg-wrapper {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    max-width: 70%;
}

.chat-msg-me    { align-self: flex-end;   flex-direction: row-reverse; }
.chat-msg-other { align-self: flex-start; }

.chat-msg-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    flex-shrink: 0;
    overflow: hidden;
}

.chat-msg-avatar-initials {
    background: linear-gradient(135deg, var(--primary), var(--accent));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.6rem;
    font-weight: 800;
    color: #fff;
}

/* bubble reset — real styles in UPGRADE block */
.chat-msg-bubble {
    display: inline-flex;
    flex-direction: column;
    gap: 3px;
    width: fit-content;
    max-width: 300px;
}

.chat-msg-me .chat-msg-bubble > * { align-self: flex-end; }

.chat-msg-sender { display: none; }

/* chat-msg-text: background/border/radius come from bubble, not text itself */
.chat-msg-text {
    font-size: 0.8rem;
    line-height: 1.48;
    color: var(--text-main);
    word-break: break-word;
    margin: 0;
    background: none;
    border: none;
    padding: 0;
    max-width: none;
}

.chat-msg-me .chat-msg-text { background: none; border: none; }

.chat-msg-image {
    max-width: 150px;
    max-height: 130px;
    border-radius: 8px;
    cursor: zoom-in;
    object-fit: cover;'''

if OLD in content:
    content = content.replace(OLD, NEW, 1)
    with open('C:/Users/LILAI PC/Music/izin/style.css', 'w', encoding='utf-8') as f:
        f.write(content)
    print("DONE — old bubble CSS replaced")
else:
    print("NOT FOUND — checking partial match")
    idx = content.find('/* ---- MESSAGE BUBBLES ----')
    print(f"Bubble block at char: {idx}")
    print(repr(content[idx:idx+200]))
