"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const content_1 = require("../../../core/vocabulary/content");
const qa_1 = require("../../../core/vocabulary/qa");
const engine_1 = require("../../../core/vocabulary/engine");
const storage_1 = require("../../../core/vocabulary/storage");
Page({
    data: {
        word: "",
        definition: "",
        question: "",
        answer: "",
        chinese: "",
        showChinese: false,
        sources: [],
        available: false,
        loading: true,
        sending: false,
        message: "",
    },
    async onLoad(q) {
        try {
            const entry = await (0, content_1.getEntry)(q.id);
            if (this._closed)
                return;
            const sense = entry.senses.find((s) => s.id === q.sense) || entry.senses[0];
            this._context = {
                word: entry.word,
                definition: sense.definition,
                senseId: sense.id,
            };
            this.setData({
                word: entry.word,
                definition: sense.definition,
                available: (0, qa_1.questionAvailable)(),
            });
        }
        catch (e) {
            if (!this._closed)
                this.setData({ message: e instanceof Error ? e.message : "加载失败" });
        }
        finally {
            if (!this._closed)
                this.setData({ loading: false });
        }
    },
    onUnload() {
        this._closed = true;
        this._request = "";
    },
    input(e) {
        if (this.data.sending)
            return;
        this.setData({ question: e.detail.value });
    },
    preset(e) {
        if (this.data.sending)
            return;
        this.setData({ question: e.currentTarget.dataset.question });
    },
    payload() {
        if (!this._context)
            throw new Error("请先加载词条");
        if (!this.data.question.trim())
            throw new Error("请先输入问题");
        return {
            version: 1,
            requestId: (0, engine_1.uid)(),
            question: this.data.question.trim(),
            context: this._context,
            language: "en",
        };
    },
    copy() {
        try {
            const p = this.payload();
            wx.setClipboardData({
                data: `Word: ${p.context.word}\nSense: ${p.context.senseId}\nDefinition (Open English Wordnet 2025, CC BY 4.0): ${p.context.definition}\nQuestion: ${p.question}\nPlease explain in English. Clearly separate your explanation from dictionary quotations.`,
            });
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
    async submit() {
        if (this.data.sending)
            return;
        try {
            const p = this.payload();
            this._request = p.requestId;
            this.setData({
                sending: true,
                message: "",
                answer: "",
                chinese: "",
                showChinese: false,
                sources: [],
            });
            const result = await (0, qa_1.askQuestion)(p);
            if (this._closed || this._request !== p.requestId)
                return;
            this.setData({
                answer: result.answer,
                chinese: result.chinese || "",
                sources: result.sources,
            });
        }
        catch (e) {
            if (!this._closed)
                this.setData({ message: e instanceof Error ? e.message : "请求失败" });
        }
        finally {
            if (!this._closed)
                this.setData({ sending: false });
        }
    },
    toggle() {
        this.setData({ showChinese: !this.data.showChinese });
    },
});
