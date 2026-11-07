export const DRIVER_LINES = {
  slow: [
    { id: 'slow-broken', text: '開這麼慢，車子壞了是不是？' },
    { id: 'slow-pedal', text: '大哥，你油門忘在家裡喔？' },
    { id: 'slow-space', text: '前面空成這樣，只有你看得到紅燈喔？' },
    { id: 'slow-walk', text: '早知道用走的，還能順便買個蛋餅。' },
  ],
  cutin: [
    { id: 'cutin', text: '幹你娘！突然切進來！' },
    { id: 'cutin-signal', text: '方向燈是選配喔？' },
    { id: 'cutin-mirror', text: '欸，切過來之前，看一下後照鏡啦！' },
    { id: 'cutin-breakfast', text: '你這樣一切，我早餐差點飛出去。' },
  ],
  parking: [
    { id: 'parking', text: '他馬的！這樣也能停？' },
    { id: 'parking-flashers', text: '雙黃燈一開，這裡就變停車格喔？' },
    { id: 'parking-bento', text: '你的便當拿到了，後面一排還在等。' },
    { id: 'parking-lane', text: '欸，留一點路給人家過啦！' },
  ],
  bump: [
    { id: 'bump', text: '幹！會不會看路啊？' },
    { id: 'bump-touch', text: '完了，真的碰到了。' },
    { id: 'bump-clock', text: '哎唷！這下打卡來不及了啦。' },
    { id: 'bump-heart', text: '哇靠，那一下我心臟快跳出來了！' },
  ],
  queue: [
    { id: 'queue', text: '幹！綠燈了啦！' },
    { id: 'queue-wake', text: '前面那台，醒醒喔！' },
    { id: 'queue-go', text: '欸，前面都走了，輪到你啦！' },
    { id: 'queue-next', text: '再不走，又要等下一個綠燈啦！' },
  ],
  jam: [
    { id: 'jam-meeting', text: '早會都快開完了，我還在車陣裡。' },
    { id: 'jam-map', text: '導航說剩五分鐘。五分鐘前它也這樣講。' },
    { id: 'jam-radio', text: '一首歌都播完了，我還在看同一張車牌。' },
    { id: 'jam-coffee', text: '咖啡都喝完了，這排到底有沒有在動？' },
  ],
};

// Finish a category's lines before repeating one, including across deck boundaries.
export class DriverLinePicker {
  constructor(random = Math.random) {
    this.random = random;
    this.history = new Map();
  }

  next(kind) {
    if (!Object.hasOwn(DRIVER_LINES, kind)) return null;
    const lines = DRIVER_LINES[kind];
    let group = this.history.get(kind);
    if (!group) {
      group = { used: new Set(), last: null };
      this.history.set(kind, group);
    }
    let choices = lines.filter(line => !group.used.has(line.id));
    if (!choices.length) {
      group.used.clear();
      choices = lines.length > 1 ? lines.filter(line => line.id !== group.last) : lines;
    }
    const line = choices[Math.floor(this.random() * choices.length)];
    group.used.add(line.id);
    group.last = line.id;
    return line;
  }
}
