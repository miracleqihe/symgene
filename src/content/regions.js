// Shared editorial instructions; these do not certify an entry's Chinese approval status.
export const regionalRules = [
  { id: 'china-first', text: '这份指南主要面向中国大陆读者；用户说明自己在其他地区时，按实际所在地调整。讲解国内用药时，先核对中国具体产品的获批说明书和国家药监部门的相关修订要求；疾病评估与治疗原则优先核对国家卫生健康委规范及国内专业指南。中文译本、国外说明书和国外指南可作补充，但不能因此认定国内批准用途。' },
  { id: 'separate-uses', text: '把中国获批适应证、国内指南讨论的超说明书用途和其他国家的获批用途分别说清。指南提到某种治疗，不等于药品已获批该用途；国外获批也不等于中国获批。没有核实中国批准情况时，不声称已获批，也不据此断言未获批。' },
  { id: 'verify-product', text: '核对具体成分、剂型、规格、上市许可持有人、批准文号或注册信息，以及说明书修订日期。儿童适用年龄范围、特殊人群、禁忌、监测和换药等治疗转换的要求按相应产品核实，不能在不同剂型、厂家和地区之间直接套用。资料访问日期与说明书修订日期分别记录。' },
  { id: 'compare-evidence', text: '出现国内外资料差异时，说明哪项内容不同、各自适用的产品和地区，并核对版本；不要把国外结论悄悄写成中国标准。一般药理学资料仍可用于解释机制，但不能据此推断国内适应证、在国内是否可以买到或能否享受医保待遇。' },
  { id: 'local-help', text: '就医与支持信息应贴合读者实际所在地。不要默认读者能使用美国、英国等地的医疗服务，也不要跨地区套用服务号码；涉及具体地区的服务或号码时，写清适用地区。' },
];

export function regionalPrompt() {
  return '## 适用地区与资料核对\n' + regionalRules.map(rule => `- ${rule.text}`).join('\n');
}

export const chinaDrugSearch = {
  title: '国家药监局：药品信息查询',
  url: 'https://www.nmpa.gov.cn/datasearch/home-index.html',
  region: '中国大陆 · 中文 · 查询入口',
  note: '按药名和批准文号核对具体产品；用途及注意事项还需阅读相应产品的说明书。',
};

export const chinaClinicalReading = {
  title: '国家卫生健康委：精神障碍诊疗规范（2020年版）',
  url: 'https://www.nhc.gov.cn/yzygj/c100068/202012/b4305ace9e14440792eb76d29602c88a.shtml',
  region: '中国大陆 · 中文 · 专业资料',
  note: '按疾病章节阅读评估、鉴别与治疗原则；这是2020年版，阅读时还需核对后续专项指南。',
};

export const chinaMentalHealthReading = {
  title: '国家心理健康和精神卫生防治中心：科普与支持',
  url: 'https://ncmhc.org.cn/',
  region: '中国大陆 · 中文 · 主题入口',
  note: '从“宣传教育—科学普及”栏目查找心理健康科普。',
};

export const chinaDepressionReading = {
  title: '抑郁症的识别、常见误解与治疗：科普视频',
  url: 'https://ncmhc.org.cn/channel/newsinfo/7027',
  region: '中国大陆 · 中文',
  note: '国家心理健康和精神卫生防治中心展播，深圳市康宁医院制作；可按自己的疑问选择观看。',
};
