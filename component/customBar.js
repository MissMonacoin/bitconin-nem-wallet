module.exports=require("../js/lang.js")({ja:require("./ja/customBar.html"),en:require("./en/customBar.html")})({
  data(){
    return {}
  },
  methods:{
    
  },
  store:require("../js/store.js"),
  computed:{
    mod(){
      return this.modifier
    }
  },
  props:["title","menu","modifier"]
})
