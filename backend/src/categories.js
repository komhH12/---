/**
 * Full Taobao product categories with Chinese names.
 * Top-level categories commonly used by sellers/merchants.
 */
const CATEGORIES = [
  { id: 'all', label: '全部', keywords: ['女装', '男装', '手机', '化妆品'] },
  { id: 'womens', label: '女装/女士精品', keywords: ['女装', '连衣裙', 'T恤', '牛仔裤', '衬衫', '半身裙', '外套', '毛衣', '卫衣', '短裤'] },
  { id: 'mens', label: '男装', keywords: ['男装', 'T恤', '休闲裤', '衬衫', '牛仔裤', '夹克', '卫衣', '西服', '短裤', 'POLO衫'] },
  { id: 'shoes', label: '鞋靴/箱包', keywords: ['运动鞋', '女鞋', '男鞋', '凉鞋', '靴子', '帆布鞋', '高跟鞋', '双肩包', '单肩包', '行李箱'] },
  { id: 'phone', label: '手机/数码', keywords: ['手机', '平板电脑', '耳机', '充电宝', '手机壳', '智能手表', '蓝牙音箱', '数据线', '相机', '笔记本'] },
  { id: 'cosmetics', label: '美妆/护肤', keywords: ['化妆品', '口红', '面膜', '粉底液', '眼影', '防晒霜', '香水', '精华液', '洗面奶', '乳液'] },
  { id: 'home', label: '家居/家装', keywords: ['家居', '四件套', '收纳', '灯具', '窗帘', '地毯', '沙发垫', '抱枕', '墙纸', '花瓶'] },
  { id: 'baby', label: '母婴/玩具', keywords: ['母婴', '纸尿裤', '奶粉', '奶瓶', '玩具', '童装', '婴儿车', '安全座椅', '积木', '早教机'] },
  { id: 'food', label: '食品/零食', keywords: ['零食', '坚果', '茶叶', '咖啡', '巧克力', '饼干', '牛肉干', '方便面', '蜂蜜', '调味品'] },
  { id: 'appliance', label: '家电/电器', keywords: ['家电', '冰箱', '洗衣机', '空调', '电饭煲', '微波炉', '吸尘器', '电风扇', '净水器', '取暖器'] },
  { id: 'sports', label: '运动/户外', keywords: ['运动', '跑步鞋', '瑜伽服', '健身器材', '帐篷', '登山鞋', '泳衣', '自行车', '羽毛球', '篮球'] },
  { id: 'jewelry', label: '珠宝/饰品', keywords: ['珠宝', '项链', '手链', '戒指', '耳环', '手镯', '黄金', '银饰', '珍珠', '发饰'] },
  { id: 'underwear', label: '内衣/家居服', keywords: ['内衣', '文胸', '内裤', '睡衣', '家居服', '袜子', '打底裤', '保暖内衣', '丝袜', '塑身衣'] },
];

const CATEGORY_LABELS = {
  all: '全部品类',
};

module.exports = { CATEGORIES };
