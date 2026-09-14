"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadShard = loadShard;
function loadShard(name) {
    if (typeof require.async !== "function")
        return Promise.reject(new Error("请升级微信以支持分包异步加载"));
    switch (name) {
        case "worddata0":
            return require.async("../../worddata0/data.js");
        case "worddata1":
            return require.async("../../worddata1/data.js");
        case "worddata2":
            return require.async("../../worddata2/data.js");
        case "worddata3":
            return require.async("../../worddata3/data.js");
        case "worddata4":
            return require.async("../../worddata4/data.js");
        case "worddata5":
            return require.async("../../worddata5/data.js");
        default:
            return Promise.reject(new Error("未知词包"));
    }
}
