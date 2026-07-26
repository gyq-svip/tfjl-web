import os, glob, json

WECHAT = r'D:\SYS\Documents\WeChat Files\ymkfqtbl\Applet\wxa46b2910643e4c31\usr\gamecaches'
RESEARCH = r'D:\withfriends\塔防精灵助手数据\research'
os.makedirs(RESEARCH, exist_ok=True)

# 卡名表（用于从描述里抽取英雄名）
cardjson = os.path.join(RESEARCH, 'game_cardnames.json')
names = json.load(open(cardjson, encoding='utf-8'))['names']
names_sorted = sorted(set(names), key=len, reverse=True)   # 长名优先，最长匹配

# 扫描 staticTableData + resources 所有 json（实际行分隔符是字面 \n）
files = sorted(set(glob.glob(WECHAT + r'\staticTableData\*.json') +
                   glob.glob(WECHAT + r'\resources\*.json')),
               key=lambda f: os.path.getsize(f))
print('扫描', len(files), '个 json')

# 预设阵容收集：name -> {heroes:set, desc, team}
lineup_map = {}
# 组成表：卡组名 -> 小队名
teams = {}

def add_lineup(name, desc, team='', src=''):
    name = name.strip()
    if not name:
        return
    heroes = [nm for nm in names_sorted if nm in desc]
    seen = set(); heroes = [x for x in heroes if not (x in seen or seen.add(x))]
    e = lineup_map.setdefault(name, {'heroes': set(), 'desc': '', 'team': '', 'src': set()})
    e['heroes'].update(heroes)
    if desc: e['desc'] = desc
    if team: e['team'] = team
    if src: e['src'].add(src)

for jf in files:
    raw = open(jf, encoding='utf-8', errors='ignore').read()
    for r in raw.split('\\n'):
        parts = r.split(',')
        if not parts:
            continue
        # 描述/阵容推荐表：含 card_deck_ 或 对战阵容推荐/合作阵容推荐
        rowtext = r
        hit_desc = None
        for i, p in enumerate(parts):
            if 'card_deck_' in p:
                hit_desc = (p.split('card_deck_')[-1], parts[i + 1] if i + 1 < len(parts) else '',
                            parts[i + 2] if i + 2 < len(parts) else '')
                break
        if hit_desc:
            deck_id, name, desc = hit_desc
            add_lineup(name.replace('描述', ''), desc, src='activity_card_deck_' + deck_id)
        elif '对战阵容推荐' in rowtext or '合作阵容推荐' in rowtext:
            # 行内形如 ...,推荐卡组,对战阵容推荐：炎魔... 取含"推荐"的字段作名
            name = ''
            for p in parts:
                if '推荐卡组' in p or p.strip() == '推荐卡组':
                    name = p.strip(); break
            if not name:
                name = '推荐卡组'
            # 描述 = 含 推荐： 的字段
            desc = ''
            for p in parts:
                if '阵容推荐：' in p:
                    desc = p.split('阵容推荐：', 1)[1]; break
            add_lineup(name, desc, src='阵容推荐')
        # 组成表：新手特卖卡组1,热能恐龙小队,...
        elif len(parts) >= 2 and '卡组' in parts[0]:
            teams[parts[0].strip()] = parts[1].strip() if len(parts) > 1 else ''

# 组装输出
lineups = []
for name, e in lineup_map.items():
    team = teams.get(name, '')
    lineups.append({'name': name, 'team': team,
                    'heroes': sorted(e['heroes']), 'desc': e['desc'],
                    'src': sorted(e['src'])})
# 有英雄的排前面
lineups.sort(key=lambda l: (-len(l['heroes']), l['name']))
out = {'source': 'game activity_card_deck 描述表 + 阵容推荐表（英雄从描述/推荐语抽取；缺失的需用户补充）',
       'note': '游戏混淆缓存里拿不到卡组真实卡牌清单，仅能从推荐语点名英雄。请用户在自己参考阵容里补全英雄。',
       'count': len(lineups), 'lineups': lineups}
json.dump(out, open(os.path.join(RESEARCH, 'lineups.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('抽取预设阵容', len(lineups), '个（含英雄', sum(1 for l in lineups if l['heroes']), '个）')
for l in lineups[:12]:
    print(' ', l['name'], '|', l['team'], '|', l['heroes'])
