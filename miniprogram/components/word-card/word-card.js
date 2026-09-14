"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const content_1 = require("../../core/vocabulary/content");
Component({
    properties: {
        entry: {
            type: Object,
            value: {},
            observer(value) {
                if (!value || !value.senses)
                    return;
                const i = value.deep
                    ? value.senses.findIndex((s) => s.id === value.deep.senseId)
                    : 0;
                this.selectSense(Math.max(0, i));
            },
        },
    },
    data: {
        selected: 0,
        sense: null,
        tokens: [],
        showZh: false,
        opened: {},
        sourceOpen: false,
        source: content_1.SOURCE,
        deepVisible: false,
    },
    methods: {
        selectSense(i) {
            const e = this.data.entry;
            if (!e || !e.senses[i])
                return;
            const sense = e.senses[i];
            this.setData({
                selected: i,
                sense,
                tokens: (sense.definition.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*|[^A-Za-z]+/g) ||
                    []).map((text) => ({ text, word: /^[A-Za-z]/.test(text) })),
                opened: {},
                showZh: false,
                sourceOpen: false,
                deepVisible: !!e.deep && e.deep.senseId === sense.id,
            });
            this.triggerEvent("sense", { senseId: sense.id });
        },
        pick(e) {
            this.selectSense(Number(e.detail.value));
        },
        chinese() {
            this.setData({ showZh: !this.data.showZh });
        },
        toggle(e) {
            const key = String(e.currentTarget.dataset.index);
            this.setData({
                opened: Object.assign(Object.assign({}, this.data.opened), { [key]: !this.data.opened[key] }),
            });
        },
        sourceToggle() {
            this.setData({ sourceOpen: !this.data.sourceOpen });
        },
        lookup(e) {
            const word = e.currentTarget.dataset.word;
            if (word)
                this.triggerEvent("lookup", { word });
        },
    },
});
