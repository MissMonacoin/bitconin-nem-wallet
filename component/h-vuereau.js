const bip39 = require("@missmonacoin/bip39-eng")
const coinUtil = require("../js/coinUtil")
const storage = require("../js/storage")
const nem = require("nem-sdk").default
const qrcode = require("qrcode")
const BigNumber = require('bignumber.js');
const axios = require('axios');
const bcLib = require('bitcoinjs-lib')

const NEM_COIN_TYPE =43
const DEFAULT_ACCOUNT=0
const NETWORK=nem.model.network.data.mainnet.id

const icons={

}

const verbs=[{
  id:"getMarried",
  name:"結婚する",
  args:{},
  alone:false
},{
  id:"goTogether",
  name:"付き合う",
  args:{},
  alone:false
},{
  id:"breakUp",
  name:"別れる",
  args:{},
  alone:false
},{
  id:"getDivorced",
  name:"離婚する",
  args:{"reason":"理由"},
  alone:false
},{
  id:"consentSex",
  name:"生行為の合意をした",
  args:{
    how:"どんな"
  },
  alone:false
},{
  id:"made",
  name:"作った",
  args:{
    how:"何を"
  },
  alone:true
},{
  id:"love",
  name:"好きです",
  args:{
    who:"何、誰を"
  },
  alone:true
}]

let endpoint = nem.model.objects.create("endpoint")("https://shibuya.supernode.me", 7891);


function toUnixDate(d){
  return 1427587585+d
}
function hex2str(s){
  if(!s){return ""}
  return (Buffer.from(s,"hex")).toString("utf8")
}

module.exports=require("../js/lang.js")({ja:require("./ja/h-vuereau.html"),en:require("./en/h-vuereau.html")})({
  data(){
    return {
      sendAmount:0,
      sendAddress:"",
      sendMosaic:"",
      invMosaic:"",
      fiatConv:0,
      password:"",
      address:"",
      qrDataUrl:"",
      shareable:coinUtil.shareable(),
      incorrect:false,
      requirePassword:true,
      loading:false,
      balances:null,
      history:null,
      message:"",
      server:'shibuya.supernode.me:7891',
      confirm:false,
      price:1,
      serverDlg:false,
      invAmt:"",
      account:null,
      accountInfo:null,
      mosaics:null,
      unconfirmed:null,
      addressFormat:"url",

      verbs,

      common:null,
      apostille:{},


      menu:"top",

      s1:"",
      s2:"",
      verb:"getMarried",
      args:{},

      auditStr:"",
      
      success:false,
      sentTxId:"",

      checkData:{}
    }
  },
  store:require("../js/store.js"),
  methods:{
    decrypt(){
      this.loading=true
      this._decrypt().catch(()=>{
        this.loading=false
        this.incorrect=true
        setTimeout(()=>{
          this.incorrect=false
        },3000)
      })
    },
    _decrypt(){
      if(this.keyPair){
        throw new Error("keypair is already decrypted")
      }
      return storage.get("keyPairs").then(c=>{
        let seed=
            bip39.mnemonicToSeed(
              bip39.entropyToMnemonic(
                coinUtil.decrypt(c.entropy,this.password)
              )
            )
        const node = bcLib.HDNode.fromSeedBuffer(seed)
              .deriveHardened(44)
              .deriveHardened(NEM_COIN_TYPE)
              .deriveHardened(DEFAULT_ACCOUNT)
        this.privateKey=node.keyPair.d.toBuffer().toString("hex")
        this.keyPair=nem.crypto.keyPair.create(this.privateKey)
        this.address =nem.model.address.toAddress(this.keyPair.publicKey.toString(),NETWORK)
        this.loading=false
        this.requirePassword=false
        this.getBalance()
        this.getQrCode()
      })
    },
    getBalance(){
      if(!this.address){
        return
      }
      this.loading=true
      nem.com.requests.account.data(endpoint,this.address).then(b=>{
        this.loading=false
        this.accountInfo=b
      }).catch(e=>{
        this.loading=false
        this.$store.commit("setError",e)
      })
      nem.com.requests.account.mosaics.owned(endpoint,this.address).then(b=>{
        this.loading=false
        return Promise.all(b.data.map(mos=>{
          if(mos.mosaicId.namespaceId==="nem"){
            return Promise.resolve({
              definitions:{
                "creator": "3e82e1c1e4a75adaa3cba8c101c3cd31d9817a2eb966eb3b511fb2ed45b8e262",
                "description": "reserved xem mosaic",
                "id": {
                  "namespaceId": "nem",
                  "name": "xem"
                },
                "properties": [{
                  "name": "divisibility",
                  "value": "6"
                }, {
                  "name": "initialSupply",
                  "value": "8999999999"
                }, {
                  "name": "supplyMutable",
                  "value": "false"
                }, {
                  "name": "transferable",
                  "value": "true"
                }],
                "levy": {}
              },
              quantity:mos.quantity,
              mosaicId:mos.mosaicId,
              divisibility:6,
              normalizedQty:(new BigNumber(mos.quantity)).shift(-6).toNumber(),
              icon:icons["nem:xem"]
            })
          }
          
          let divisibility=6;
          let mData
          return nem.com.requests.namespace.mosaicDefinitions(endpoint,mos.mosaicId.namespaceId).then(def=>{
            
            for(let i=0;i<def.data.length;i++){
              mData=def.data[i].mosaic
              if(mData.id.name!==mos.mosaicId.name){
                continue
              }
              const prp=mData.properties
              for(let j=0;j<prp.length;j++){
                if(prp[j].name==="divisibility"){
                  divisibility=parseInt(prp[j].value)
                }
              }
            }
            return nem.com.requests.mosaic.supply(endpoint,nem.utils.format.mosaicIdToName(mos.mosaicId))
          }).then(res=>{
            return {
              definitions:mData,
              supply:res.supply,
              divisibility,
              quantity:mos.quantity,
              mosaicId:mos.mosaicId,
              normalizedQty:(new BigNumber(mos.quantity)).shift(-divisibility).toNumber(),
              icon:icons[mos.mosaicId.namespaceId+':'+mos.mosaicId.name]
            }
          })
        }))
      }).then(res=>{
        this.mosaics=res
      }).catch(e=>{
        this.loading=false
        this.$store.commit("setError",e)
      })

      nem.com.requests.account.transactions.all(endpoint,this.address).then(txs => {
        this.history=txs.data.map(el=>{
          let tr;
          if(el.transaction.otherTrans){
            tr=el.transaction.otherTrans
          }else{
            tr=el.transaction
          }
          return {
            txHash:el.meta.hash.data,
            recipient:tr.recipient,
            message:hex2str(tr.message.payload),
            timeStamp:toUnixDate(tr.timeStamp)
          }
        })
      });
      nem.com.requests.account.transactions.unconfirmed(endpoint,this.address).then(x => {
        this.unconfirmed=x.data.map(el=>{
          let tr;
          if(el.transaction.otherTrans){
            tr=el.transaction.otherTrans
          }else{
            tr=el.transaction
          }
          return {
            recipient:tr.recipient,
            message:hex2str(tr.message.payload,"hex")
          }
        });
      });
    },
    copyAddress(){
      coinUtil.copy(this.shareStr)
    },
    share(event){
      const targetRect = event.target.getBoundingClientRect(),
            targetBounds = targetRect.left + ',' + targetRect.top + ',' + targetRect.width + ',' + targetRect.height;
      coinUtil.share({
        title:"ビット婚姻でチェックしよう",
        message:this.shareStr
      },targetBounds).then(()=>{
      }).catch(()=>{
        this.copyAddress()
      })
    },
    send(){
      this.sentTxId=""
      this.confirm=false
      this.loading=true
      let addrProm=Promise.resolve(this.sendAddress)
      
      addrProm.then(addr=>{
        this.sendAddress=addr
        
        const common =this.common= nem.model.objects.get("common")
        common.privateKey=this.privateKey

        const fileContent = nem.crypto.js.enc.Utf8.parse(this.apostilleStr)

        this.apostille = nem.model.apostille.create(common, "bitConIn.json", fileContent, "BitConIn Apostille", nem.model.apostille.hashing["SHA256"], false, false, false, NETWORK);
        this.confirm=true
        this.loading=false
      }).catch((e)=>{
        this.loading=false
        this.$store.commit("setError",e)
      })
    },
    broadcast(){
      this.confirm=false
      this.loading=true
      nem.model.transactions.send(this.common,this.apostille.transaction,endpoint).then(m=>{
        if(m.code>=2){
          throw m.message
        }
        this.sentTxId=m.transactionHash.data
        this.loading=false
        this.sendAddress=""
        this.sendAmount=0
        this.message=""
        this.destTag=0
        this.success=true
      }).catch(e=>{
        this.loading=false
        this.$store.commit("setError",e.data?e.data.message:e)
      })
    },
    connect(){
      this.serverDlg=false
    },
    getPrice(){
      axios({
        url:"https://apiv2.bitcoinaverage.com/indices/crypto/ticker/XEMBTC",
        method:"GET"
      }).then(res=>{
        this.price =res.data.last
        return coinUtil.getPrice("btc",this.$store.state.fiat)
      }).then(p=>{
        this.price*=p
      }).catch(()=>{
        this.price=1
      })
    },
    getQrCode(){
      qrcode.toDataURL(this.url,{
        errorCorrectionLevel: 'M',
        type: 'image/png'
      },(err,url)=>{
        this.qrDataUrl=url
      })
    },
    openExplorer(txId){
      coinUtil.openUrl("http:///explorer.nemchina.com/#/s_tx?hash="+txId)
    },
    donateMe(){
      coinUtil.openUrl("https://missmonacoin.github.io")
    },
    setServer(){
      
      const spl=this.server.split(":")
      if(!spl[1]){
        this.server="shibuya.supernode.me:7891"
        endpoint=nem.model.objects.create("endpoint")("https://shibuya.supernode.me",7891)
        return
      }
      endpoint=nem.model.objects.create("endpoint")("https://"+spl[0], spl[1]|0)
      
    },

    getApostilleStr(s1,s2="",verb,args){
      return JSON.stringify({s1,s2,verb,args})
    },
    
    check(){
      this.checkData={}
      try{
        const audit=JSON.parse(this.auditStr)
        const apStr= nem.crypto.js.enc.Utf8.parse(this.getApostilleStr(audit.s1,audit.s2,audit.verb,audit.args))
        nem.com.requests.transaction.byHash(endpoint, audit.txId).then((res)=> {
        // Verify
        if (nem.model.apostille.verify(apStr, res.transaction)) {
          this.$set(this,"checkData",audit)
        } else {
          this.checkData={error:true}
        }
      }, function(err) {
        this.checkData={error:true}
      });
      }catch(e){
        this.checkData={error:true}
      }
      
    },
    getVerb(verb){
      let ret;
      this.verbs.forEach(v=>{
        if(v.id===verb){
          ret=v.name
        }
      })
      return ret
    },
    getVerbArgName(verb,arg){
      let ret;
      this.verbs.forEach(v=>{
        if(v.id===verb){
          ret=v.args[arg]
        }
      })
      return ret
    },
    getUrl(data){return `https://monya-wallet.github.io/monya/a/?amount=0&address=NEM_APOSTILLE_BITCONIN&label=${encodeURIComponent(data)}&scheme=h-vuereau`},
    tweet(url){
      coinUtil.openUrl("https://twitter.com/intent/tweet?text=%E3%83%93%E3%83%83%E3%83%88%E5%A9%9A%E5%A7%BB%E3%81%A7%E3%81%BF%E3%82%93%E3%81%AA%E3%81%AB%E3%81%97%E3%82%89%E3%81%9B%E3%82%88%E3%81%86&url="+encodeURIComponent(url))
    }
  },
  computed:{
    url(){
      return ""
    },
    isValidAddress(){
      if(this.sendAddress[0]==="@"){
        return true
      }else{
        return nem.model.address.isValid(this.sendAddress)
      }
    },
    apostilleStr(){
      return this.getApostilleStr(this.s1,this.s2,this.verb,this.args)
    },
    shareStr(){
      return JSON.stringify({
        s1:this.s1,
        s2:this.s2,
        verb:this.verb,
        args:this.args,
        txId:this.sentTxId
      })
    },
    verbArg(){
      let ret;
      this.verbs.forEach(v=>{
        if(v.id===this.verb){
          ret=v.args
        }
      })
      return ret
    },
    alone(){
      let ret;
      this.verbs.forEach(v=>{
        if(v.id===this.verb){
          ret=v.alone
        }
      })
      return ret
    }
  },
  watch:{
    fiatConv(v){
      if(v){this.sendAmount=parseFloat(v)/this.price}
      else{this.sendAmount=0}
    },
    sendAmount(v){
      this.fiatConv=parseFloat(v)*this.price
    },
    invAmt(){
      this.getQrCode()
    },
    invMosaic(){
      this.getQrCode()
    },
    sendMosaic(){
      this.invMosaic=this.sendMosaic
    },
    addressFormat(){
      this.getQrCode()
    },
    password(){
      this._decrypt().catch(()=>true)
    }
  },
  mounted(){
    const rSend = this.$store.state.extensionSend||{}
    if(rSend.label){
      this.menu="audit"
      this.auditStr=rSend.label
    }
    this.$store.commit("setExtensionSend",{})
    this.connect()
    this.getPrice()
    storage.verifyBiometric().then(pwd=>{
      this.password=pwd
      this.decrypt()
    }).catch(()=>{
      return
    })
  },
  filters:{
    friendlyName(n){
      return {
        "ecobit:eco":"EcoBit",
        "lc:jpy":"円",// LCNEM currency name are recommened to be local notation
        "lc:usd":"Dollar",
        "lc:zar":"South African Dollar",
        "lc:hkd":"Hong Kong Dollar",
        "lc:eur":"Euro",
        "lc:aud":"Australian Dollar",
        "lc:gbp":"Pound sterling",
        "lc:chf":"Schweizer Franken"
      }[n]||n
    }
  }
})
