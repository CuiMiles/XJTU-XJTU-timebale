/** Backend integration seam. Never configure a model vendor API key in this client. */
export interface QuestionRequest {
  version: 1;
  requestId: string;
  question: string;
  context: { word: string; senseId: string; definition: string };
  language: "en";
}
export interface QuestionAnswer {
  answer: string;
  chinese?: string;
  sources: Array<{ title: string; url: string }>;
}
export interface QuestionProvider {
  ask(input: QuestionRequest): Promise<QuestionAnswer>;
}
export class QuestionError extends Error {
  constructor(
    public code: "UNAVAILABLE" | "INVALID" | "AUTH" | "RATE_LIMIT" | "NETWORK",
    message: string,
  ) {
    super(message);
  }
}
let provider: QuestionProvider | null = null;
export function configureQuestionProvider(next: QuestionProvider | null): void {
  provider = next;
}
export function questionAvailable(): boolean {
  return provider !== null;
}
export async function askQuestion(
  input: QuestionRequest,
): Promise<QuestionAnswer> {
  if (
    !input ||
    input.version !== 1 ||
    input.language !== "en" ||
    typeof input.requestId !== "string" ||
    !/^[a-z0-9-]{1,100}$/.test(input.requestId) ||
    typeof input.question !== "string" ||
    !input.question.trim() ||
    input.question.length > 1000 ||
    !input.context ||
    typeof input.context.definition !== "string" ||
    !input.context.definition ||
    input.context.definition.length > 4000 ||
    typeof input.context.word !== "string" ||
    !input.context.word ||
    input.context.word.length > 100 ||
    typeof input.context.senseId !== "string" ||
    !input.context.senseId ||
    input.context.senseId.length > 200
  )
    throw new QuestionError("INVALID", "问题或词条上下文无效");
  if (!provider)
    throw new QuestionError(
      "UNAVAILABLE",
      "问答服务尚未接入，可复制问题与英文释义供以后使用",
    );
  const result = await provider.ask(input);
  if (
    !result ||
    typeof result.answer !== "string" ||
    !result.answer.trim() ||
    result.answer.length > 20000 ||
    (result.chinese !== undefined &&
      (typeof result.chinese !== "string" || result.chinese.length > 20000)) ||
    !Array.isArray(result.sources) ||
    result.sources.length > 20 ||
    result.sources.some(
      (s) =>
        !s ||
        typeof s.title !== "string" ||
        s.title.length > 200 ||
        typeof s.url !== "string" ||
        s.url.length > 2000 ||
        !/^https:\/\//.test(s.url),
    )
  )
    throw new QuestionError("INVALID", "问答服务返回格式无效");
  return result;
}
/** Configure only a first-party HTTPS backend after deploying authentication and rate limits. */
export function createHttpProvider(
  endpoint: string,
  token: () => Promise<string>,
): QuestionProvider {
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?\//i.test(endpoint))
    throw new Error("问答后端必须使用 HTTPS");
  return {
    async ask(input) {
      const session = await token();
      if (!session) throw new QuestionError("AUTH", "请先完成问答服务身份验证");
      return new Promise((resolve, reject) =>
        wx.request({
          url: endpoint,
          method: "POST",
          data: input,
          timeout: 30000,
          header: {
            "content-type": "application/json",
            Authorization: "Bearer " + session,
          },
          success(res) {
            if (res.statusCode === 401 || res.statusCode === 403)
              reject(new QuestionError("AUTH", "问答服务认证失败"));
            else if (res.statusCode === 429)
              reject(
                new QuestionError("RATE_LIMIT", "提问过于频繁，请稍后重试"),
              );
            else if (res.statusCode !== 200)
              reject(new QuestionError("NETWORK", "问答服务暂不可用"));
            else resolve(res.data as QuestionAnswer);
          },
          fail: () =>
            reject(
              new QuestionError("NETWORK", "请求未完成，请检查网络后重试"),
            ),
        }),
      );
    },
  };
}
