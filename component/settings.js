const storage=require("../js/storage")
const monappyApi=require("../js/monappyApi")
const currencyList = require("../js/currencyList")
const lang = require("../js/lang.js")
const ext = require("../js/extension.js")

module.exports=lang({ja:require("./ja/settings.html"),en:require("./en/settings.html")})({
  data(){
    return {
      isWebView:false,
      monappyNotExist:false,
      d:{
        includeUnconfirmedFunds:false,
        useEasyUnit:false,
        absoluteTime:false,
        fiat:"jpy",
        paySound:false,
        monappy:{
          enabled:false,
          myUserId:""
        },
        monaparty:{
          enabled:true,
          bgClass:"sand"
        },
        enabledExts:[]
      },
      monapartyTitleList:currencyList.monapartyTitle,
      lang:"ja",
      extensions:[]
    }
  },
  methods:{
    goToShowPassphrase(){
      this.$emit("push",require("./showPassphrase.js"))
    },

    goToSetPassword(){
      this.$emit("push",require("./setPassword.js"))
    },

    save(){
      this.$nextTick(()=>{
        this.$set(this.d,"enabledExts",[])
        this.extensions.forEach(v=>{
          v.usable&&this.d.enabledExts.push(v.id)
        })
        storage.set("settings",this.d)
        this.$store.commit("setSettings",this.d)
      })
    },
    changeMonappy(){
      this.save()
      if (this.d.monappy.myUserId) {
        monappyApi.getAddress(this.d.monappy.myUserId).then(r=>{
          this.monappyNotExist=!r
        }).catch(r=>{
          this.monappyNotExist=true
        })
      }else{
        this.monappyNotExist=false
      }
    },
    changeLang(){
      storage.changeLang(this.lang)
    }
  },
  mounted(){
    this.isWebView=this.$ons.isWebView()
    storage.get("settings").then(d=>{
      Object.assign(this.d,d)
      this.lang=lang.getLang()
      ext.each(x=>{
        this.extensions.push({
          id:x.id,
          name:x.name,
          icon:x.icon,
          usable:!!~this.d.enabledExts.indexOf(x.id)
        })
      })
    })
  }
})
