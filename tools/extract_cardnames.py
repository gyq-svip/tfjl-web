"""从微信小游戏缓存的卡牌总表(混淆 CSV)中抽取完整卡名列表。
游戏把卡牌表存成转义换行(\\r\\n)包在字符串里的 CSV，部分字段 base64 密文，
但卡名与 ui/cardpic_l/{id} 路径是明文。
输出 tools/game_cardnames.json: {count, cards:[{id,name,cardpic}], names:[...]}
"""
import os, json

CACHE = r"D:\SYS\Documents\WeChat Files\ymkfqtbl\Applet\wxa46b2910643e4c31\usr\gamecaches\resources"
OUT = r"D:\withfriends\塔防精灵助手数据\research\game_cardnames.json"

# 卡牌总表文件(含 ui/cardpic_l/ 明文路径)
JF = os.path.join(CACHE, "17294991223931.json")

raw = open(JF, encoding="utf-8", errors="ignore").read()
# 按字面反斜杠-r-反斜杠-n 拆分
rows = raw.split("\\r\\n")
print("按转义换行拆分得", len(rows), "块")

cards = []
seen = set()
for ln in rows:
    parts = ln.split(",")
    k = None
    for i, p in enumerate(parts):
        if p.startswith("ui/cardpic_l/"):
            k = i
            break
    if k is None:
        continue
    # 第6字段(索引5)=背包类型：2=卡牌背包，只保留真·卡牌
    if len(parts) <= 5 or parts[5].strip() != "2":
        continue
    cid = parts[0].strip()
    # 卡名固定在第2字段(parts[1])；过滤掉任务/获取途径类脏文本
    name = parts[1].strip() if len(parts) > 1 else ""
    if not cid or not name or name in seen:
        continue
    if '"' in name or "+" in name or len(name) > 20:
        continue
    if any(w in name for w in ["获得", "礼包", "活动", "商店", "兑换", "奖励", "任务", "?", "%", "（"]):
        continue
    seen.add(name)
    cards.append({"id": cid, "name": name, "cardpic": parts[k].strip()})

names = sorted(set(c["name"] for c in cards))
json.dump({"count": len(cards), "cards": cards, "names": names},
          open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print("提取卡牌数(去重名过滤后)", len(cards))
print("已写", OUT, "唯一定义名", len(names))
print("样例:", names[:25])
