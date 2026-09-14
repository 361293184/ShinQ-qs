/**
 * 来信模块的两套字体栈 —— 单一来源。
 *
 * 抽出来的理由：这套视觉最核心的 token 就是「信里用什么字」。信纸、信封卡片、
 * 回信全文弹窗三处都要用同一个值，各自写一份字符串迟早会飘成三种写法。
 *
 * 约定（改动前请先读）：
 *   - **一封信里只用其中一套**，绝不混排。混排会让同一段话里出现两种字形，看着很花
 *     —— 这正是之前换字体的原因；
 *   - 两套都是系统字体，不新增任何网络请求；缺字时都能回退到同气质的一类（楷系 / 衬线系）；
 *   - 都不加粗：楷体字库只有 400 字重，合成加粗的观感会变成另一种字。
 */

/** 手写楷体 —— 普通节日（情书 / 生日 / 纪念日 / 圣诞 / 跨年）。 */
export const HANDWRITING_STACK = "'LXGW WenKai', 'Kaiti SC', 'KaiTi', 'STKaiti', serif";

/** 印刷宋体 —— 新年信笺（除夕 / 春节）。 */
export const SERIF_STACK = "'Songti SC', 'STSong', 'SimSun', 'Noto Serif SC', 'Source Han Serif SC', 'Times New Roman', serif";
