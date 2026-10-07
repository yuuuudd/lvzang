export const templates=[
 {id:'garden',title:'人物 × 江南园林',city:'苏州',model:'sz',image:'/assets/people-garden.png',collage:'/assets/keepsakes/sz.png',people:true,description:'让同行的人与小桥、亭台一起，成为一件旅行纪念品。'},
 {id:'city',title:'城市地标',city:'广州',model:'gz',image:'/assets/magnets/gz.png',collage:'/assets/keepsakes/gz.png',people:false,description:'收藏城市天际线，也留下一段属于你的故事。'},
 {id:'relief',title:'旅行浮雕',city:'杭州',model:'hz',image:'/assets/magnets/hz.png',collage:'/assets/keepsakes/hz.png',people:false,description:'把沿途的风景，收进一枚可以触摸的纪念品。'}
];
export const templateById=id=>templates.find(t=>t.id===id);
