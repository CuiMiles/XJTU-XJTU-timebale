export const COLORS = [
  { id: "rose", label: "浅玫红", background: "#f6dce5", text: "#613a4b", secondary: "#785565" },
  { id: "blue", label: "浅蓝", background: "#dae8f8", text: "#334c69", secondary: "#536b86" },
  { id: "mint", label: "薄荷绿", background: "#d9efe6", text: "#345b4c", secondary: "#557567" },
  { id: "peach", label: "浅橙", background: "#f7e1d5", text: "#6b493d", secondary: "#856257" },
  { id: "lavender", label: "淡紫", background: "#e8e2f7", text: "#53476b", secondary: "#706385" },
  { id: "cyan", label: "浅青", background: "#dceff1", text: "#355b61", secondary: "#55777b" },
  { id: "sand", label: "米黄", background: "#f5eccf", text: "#66583e", secondary: "#817258" },
  { id: "slate", label: "灰蓝", background: "#e3eaf2", text: "#425367", secondary: "#607184" },
];
export function colorChoice(id?: string) {
  return COLORS.find((c) => c.id === id);
}
