import { Entry } from "../../core/vocabulary/types";
import { SOURCE } from "../../core/vocabulary/content";
Component({
  properties: {
    entry: {
      type: Object,
      value: {},
      observer(value: any) {
        if (!value || !value.senses) return;
        const i = value.deep
          ? value.senses.findIndex((s: any) => s.id === value.deep.senseId)
          : 0;
        this.selectSense(Math.max(0, i));
      },
    },
  },
  data: {
    selected: 0,
    sense: null as any,
    tokens: [] as any[],
    showZh: false,
    opened: {} as Record<string, boolean>,
    sourceOpen: false,
    source: SOURCE,
    deepVisible: false,
  },
  methods: {
    selectSense(i: number) {
      const e = this.data.entry as unknown as Entry;
      if (!e || !e.senses[i]) return;
      const sense = e.senses[i];
      this.setData({
        selected: i,
        sense,
        tokens: (
          sense.definition.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*|[^A-Za-z]+/g) ||
          []
        ).map((text) => ({ text, word: /^[A-Za-z]/.test(text) })),
        opened: {},
        showZh: false,
        sourceOpen: false,
        deepVisible: !!e.deep && e.deep.senseId === sense.id,
      });
      this.triggerEvent("sense", { senseId: sense.id });
    },
    pick(e: any) {
      this.selectSense(Number(e.detail.value));
    },
    chinese() {
      this.setData({ showZh: !this.data.showZh });
    },
    toggle(e: any) {
      const key = String(e.currentTarget.dataset.index);
      this.setData({
        opened: { ...this.data.opened, [key]: !this.data.opened[key] },
      });
    },
    sourceToggle() {
      this.setData({ sourceOpen: !this.data.sourceOpen });
    },
    lookup(e: any) {
      const word = e.currentTarget.dataset.word;
      if (word) this.triggerEvent("lookup", { word });
    },
  },
});
