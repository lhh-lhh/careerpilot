/** Stable reference identifiers; the original three IDs must never be renumbered. */
export const majorCities=[
  ['1','上海'],['2','杭州'],['3','南京'],['beijing','北京'],['tianjin','天津'],['chongqing','重庆'],
  ['guangzhou','广州'],['shenzhen','深圳'],['chengdu','成都'],['wuhan','武汉'],['xian','西安'],['zhengzhou','郑州'],
  ['shijiazhuang','石家庄'],['taiyuan','太原'],['hohhot','呼和浩特'],['shenyang','沈阳'],['changchun','长春'],['harbin','哈尔滨'],
  ['hefei','合肥'],['fuzhou','福州'],['nanchang','南昌'],['jinan','济南'],['changsha','长沙'],['nanning','南宁'],
  ['haikou','海口'],['guiyang','贵阳'],['kunming','昆明'],['lhasa','拉萨'],['lanzhou','兰州'],['xining','西宁'],['yinchuan','银川'],['urumqi','乌鲁木齐'],
  ['suzhou','苏州'],['wuxi','无锡'],['ningbo','宁波'],['wenzhou','温州'],['xiamen','厦门'],['quanzhou','泉州'],['qingdao','青岛'],
  ['dalian','大连'],['dongguan','东莞'],['foshan','佛山'],['zhuhai','珠海'],['yantai','烟台'],['luoyang','洛阳'],['mianyang','绵阳'],
  ['sanya','三亚'],['nanchong','南充'],['changzhou','常州'],['nantong','南通'],['jiaxing','嘉兴'],['shaoxing','绍兴'],['jinhua','金华'],
  ['hongkong','香港'],['macau','澳门'],['taipei','台北'],
].map(([code,label])=>({id:`city-${code}`,code:code!,label:label!}));
