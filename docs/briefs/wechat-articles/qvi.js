var _extends=Object.assign||function(e){
for(var t=1;t<arguments.length;t++){
var i=arguments[t];
for(var o in i)Object.prototype.hasOwnProperty.call(i,o)&&(e[o]=i[o]);
}
return e;
};
define("pages/qq_video_info.js",["biz_wap/zepto/zepto.js","biz_wap/zepto/event.js","biz_wap/zepto/touch.js","biz_wap/ui/weui.js","biz_common/utils/string/html.js","a/a_utils.js","appmsg/without_iframe/iframe_communicate.js","pages/iframe_communicate.js","biz_wap/jsapi/core.js","biz_wap/utils/mmversion.js","biz_common/utils/url/parse.js","biz_wap/utils/ajax.js","pages/loadscript.js","pages/video_plugin/video_monitor.js","biz_wap/utils/localstorage.js","biz_wap/utils/storage.js","pages/version4video.js","biz_common/dom/event.js","pages/report.js","new_video/plugin/proxy.js","new_video/plugin/ad.js","new_video/plugin/danmu.js","new_video/player.js","new_video/ctl.js","biz_common/tmpl.js","pages/video_error.html.js","pages/create_txv.js","biz_wap/utils/jsmonitor_report.js","biz_wap/jsapi/leaveReport.js","biz_wap/jsapi/log.js","page/pages/video_new.css"],function(e){
"use strict";
function t(){
return new Promise(function(e){
D.invoke("getNetworkType",{},function(t){
e(t),Q.networkType=K[t.err_msg]||"fail",("network_type:edge"==t.err_msg||"network_type:wwan"==t.err_msg)&&(t.detailtype||t.subtype)&&(Q.networkType=t.detailtype||t.subtype);
});
});
}
function i(){
U.on(window,"load",function(){
if(window.__wxjs_is_wkwebview){
Q.videoDataLs=new C("video_report_11949");
var e=Q.videoDataLs.getData();
for(var t in e){
var i=+new Date;
i-(e[t].exp-Q.videoDataLsExpTime)>6e4&&(V.videoreport({
data:e[t].val,
async:!0
}),Q.videoDataLs.remove(t));
}
Q.neeedTimoutSaveReportData=!0;
}else Q.neeedTimoutSaveReportData=!1;
});
var e=function(){
if(!Q.hasLeaveReport){
Q.hasLeaveReport=!0;
for(var e=0;e<Q.videoInstance.length;e++){
var t=Q.videoInstance[e];
t.mpVideoReport(),t.destroy();
}
}
};
window.top===window&&G.addReport(e),window.top===window&&G.addSpecificReport("native_data",function(){
var e=Q.videoInstance[0];
return e?{
video_data:{
vid:e._o.vid,
lastPlayedTime:e._g.myPlayer&&e._g.myPlayer.getCurTime(),
lastPlayedTimeExpiredTime:(Date.now()+Q.cacheTime)/1e3
}
}:{};
}),U.on(window,"unload",e);
}
function o(e){
var t=arguments.length<=1||void 0===arguments[1]?{}:arguments[1];
this._o={
bizUserName:"",
bizNickName:"",
videoTitle:"",
headImgUrl:"",
jsapiFullScreen:!0,
canShareVideo:!0,
videoMd5:"",
pauseShowControll:!0,
preview:!1,
isInIframe:!1,
fromid:0,
ori_status:3,
is_mp_video:0,
plugins:[],
oriVid:"",
vid:"",
ckey:"",
ckey_ad:"",
width:0,
height:0,
container:"",
autoplay:!1,
loop:!1,
resume:Q.resume,
__biz:"",
uin:"",
mid:"",
idx:"",
comment_id:"",
scene_type:0,
hit_bizuin:"",
hit_vid:"",
totalRange:10,
noAd:!1,
isVideoSharePage:!1,
useWcSlPlayer:!1,
useDanmu:!1,
auto:{
loadRetryTime:0,
isShowTip:!1,
isChangeAuto:!1,
isShowSuc:!1
},
onReady:function(){},
onUserplay:function(){}
},this.cgiData=_extends({},window.cgiData,t),w(this._o,e),(!Q.isWechat||!Q.isIOS&&!Q.isAndroid||Q.isIOS&&I.ltVersion("7.0.9",!1)||Q.isAndroid&&I.ltVersion("7.0.10",!1)||I.isInMiniProgram||!this._o.videoMd5)&&(this._o.jsapiFullScreen=!1,
this._o.canShareVideo=!1),this._o.is_mp_video||this._o.useWcSlPlayer||(this._o.pauseShowControll=!1),
!this._o.headImgUrl&&this._o.jsapiFullScreen&&Q.isAndroid&&(this._o.headImgUrl="http://mmbiz.qpic.cn/mmbiz/a5icZrUmbV8p5jb6RZ8aYfjfS2AVle8URwBt8QIu6XbGewB9wiaWYWkPwq4R7pfdsFibuLkic16UcxDSNYtB8HnC1Q/0"),
this._o.oriVid=this._o.oriVid||this._o.vid,1!=this._o.ori_status&&2!=this._o.ori_status&&(this._o.ori_status=3),
this._init({
noProxy:this._o.useWcSlPlayer
}),"number"==typeof this._o.leaveReport12710Type&&this._leaveReport12710();
}
function r(e){
function t(o){
var r=Math.floor(Math.max(o.width,o.height));
if(r>3841)switch(1*o.format_id){
case 10002:
o=e.url_info[i["480p"].index],H.setSum(27302,6,1),t(o);
break;

case 10003:
o=e.url_info[i["270p"].index],H.setSum(27302,7,1);
}
return o;
}
for(var i={},o=0;o<e.url_info.length;o++){
var r=e.url_info[o];
switch(1*r.format_id){
case 20003:
Q.isWechat&&Q.isAndroid&&I.gtVersion("7.0.16",1)&&(i["1080p"]={
index:o
});
break;

case 10002:
i["720p"]={
index:o
};
break;

case 10003:
i["480p"]={
index:o
};
break;

case 10004:
i["270p"]={
index:o
};
}
}
var a=void 0;
if(Q.playerStatus&&Q.playerStatus.formatId&&1*e.is_mp_video_urgent_state!==1)switch(1*Q.playerStatus.formatId){
case 10002:
i["720p"]&&(a=e.url_info[i["720p"].index]);
break;

case 10003:
i["480p"]&&(a=e.url_info[i["480p"].index]);
break;

case 10004:
i["270p"]&&(a=e.url_info[i["270p"].index]);
}
a||(1*e.is_mp_video_urgent_state===1?i["270p"]?a=e.url_info[i["270p"].index]:i["480p"]&&(a=e.url_info[i["480p"].index]):Q.isPc||"wifi"==Q.networkType?i["720p"]?a=e.url_info[i["720p"].index]:i["480p"]&&(a=e.url_info[i["480p"].index]):i["480p"]?a=e.url_info[i["480p"].index]:i["720p"]&&(a=e.url_info[i["720p"].index])),
a||(a=e.url_info[0]),a=t(a);
var n=Math.floor(a.duration_ms/1e3),s=(parseFloat(a.filesize)/1024/1024).toFixed(2),d=window.biz;
d||window.cgiData&&window.cgiData.__biz&&(d=window.cgiData.__biz);
var _=a.url.replace(/^http(s?):/,location.protocol);
return{
formatid:a.format_id,
time:n,
title:a.title||"",
width:a.width,
height:a.height,
file_size:a.filesize,
totalUrl:_+"&spec_id="+encodeURIComponent(d)+parseInt(+new Date/1e3,10),
rate:Math.round(a.filesize/1024*8/n),
flow:s,
ori_url_info:e.url_info.map(function(e){
return _extends({},e,{
url:e.url.replace(/^http(s?):/,location.protocol)
});
})
};
}
function a(e){
function t(){
S({
type:"GET",
dataType:"json",
timeout:3e4,
url:_,
success:function(e){
if(e&&e.base_resp&&0==e.base_resp.ret){
var t="",i=void 0;
if(e.is_mp_video_delete?(t="该视频已被发布者删除",i=72):e.is_mp_video_forbid?(t="该视频因违规已下架",
i=73):1*e.is_mp_video_transing===1?(t="正在转码，转码完成后可播放",i=78):e.is_mp_video_checking?(t="审核中",
i=75):e.is_mp_video_check_fail?(t="审核失败",i=76):1*e.is_appmsg_unauthorized===1&&(t="该视频因未经授权使用而无法查看",
i=77),t&&"undefined"!=typeof i)return void a({
err_msg:t,
code:i
});
if(e.url_info&&e.url_info.length>0)return void o({
data:r(e)
});
a({
err_msg:N,
code:71
});
}else a({
err_msg:"当前视频不存在，暂无法观看",
code:74
});
},
error:function(e){
var t=void 0;
t=e?e.status>=200&&e.status<400?81:e.status>=400&&e.status<500?82:e.status>=500&&e.status<600?83:0==e.status&&4==e.readyState?84:85:80,
a({
err_msg:N,
code:t
});
}
});
}
var i=e.retry||1,o="function"==typeof e.onSuccess?e.onSuccess:function(){},a=function(o){
return o&&o.code>=80&&o.code<=85&&i>0?(i--,void t()):void("function"==typeof e.onError&&e.onError(o));
},s=top.window.location.search.match(/token=([^&]*)/),d=s?s[1]:"",_=["/cgi-bin/video?action=get_mp_video_play_url","&vid=",e.vid,"&token=",d].join("");
return d?void n(t):void a({
err_msg:"当前视频不存在，暂无法观看",
code:79
});
}
function n(e){
window.networkType||Q.networkType||Q.isPc?e():Y?D.invoke("getNetworkType",{},function(t){
Q.networkType=K[t.err_msg]||"fail",("network_type:edge"==t.err_msg||"network_type:wwan"==t.err_msg)&&(t.detailtype||t.subtype)&&(Q.networkType=t.detailtype||t.subtype),
e();
}):e();
}
function s(e){
function t(){
M({
url:i,
timeout:3e4,
callbackName:"video_dynamic_callback",
callback:function(t){
var i=+new Date,r=i-o;
t=t||{},"undefined"==typeof t.em&&(t.em=0);
var a=t.em,n=void 0;
if(!R.getQuery("channel_session_id")||61!==t.em&&62!==t.em||S({
type:"POST",
dataType:"json",
timeout:3e4,
url:"/mp/videochannel_profile_page",
data:{
action:"report_tx_video",
vid:e.vid,
status:t.em
},
success:function(e){
console.log(e);
}
}),0==t.em){
if(t.exem>0?a=-4:0==t.exem&&t.vl&&t.vl.vi&&t.vl.vi[0]&&8==t.vl.vi[0].st&&(a=t.preview>0?-5:-3),
0!=a||t.vl&&t.vl.vi&&t.vl.vi[0]||(a=-2),0==a){
var s=t.vl.vi[0];
if(n={
newVid:s.lnk,
time:Math.floor(s.td),
title:s.ti,
width:s.vw,
height:s.vh,
file_size:s.fs,
rate:Math.round(s.fs/1024*8/s.td),
flow:(parseFloat(s.fs)/1024/1024).toFixed(2)
},s.ul&&s.ul.ui&&s.ul.ui[0]){
var _=s.ul.ui[0],c=_.url+s.fn,p=t.fl,g="";
if(p&&p.cnt>0){
for(var u=p.fi,l={},h=0;h<u.length;h++){
var v=u[h];
switch(v.name){
case"msd":
l["270P"]={
index:h
};
break;

case"mp4":
l["480p"]={
index:h
};
}
var f;
Q.isPc||"wifi"==Q.networkType?l["480p"]?f=u[l["480p"].index]:l["270P"]&&(f=u[l["270P"].index]):l["270P"]?f=u[l["270P"].index]:l["480p"]&&(f=u[l["480p"].index]),
f||(f=u[0]),n.formatid=f.id,g=f.name,n.resolution=(f.cname||"").replace(/^.*;\((:?.*)P\)$/,"$1")||0;
}
n.format=g,n.vt=_.vt,n.totalUrl=[c,-1!=c.indexOf("?")?"&":"?","vkey=",s.fvkey,"&sdtfrom=",V.getsdtfrom(),"&type=",1==_.dt?"tflv":2==_.dt||0==_.dt?"mp4":"","&platform=",V.getPlatformType(),"&fmt=",g,"&level=",s.level,"&br=",s.br,"&sp=",s.sp].join("");
}else a=-2;
}
}
0==a?(V.getinfoReport({
vid:e.vid,
val:r,
val1:a,
vurl:n.totalUrl
}),e.onSuc({
data:n,
oriData:t,
c_time:r,
ret_code:a
})):(V.getinfoReport({
vid:e.vid,
val:r,
val1:a,
vurl:""
}),e.onError(-2,{
ret_code:a,
c_time:r,
err_msg:d(1*a,1*t.exem,t)
}));
}else e.onError(a,{
ret_code:a,
c_time:r,
err_msg:d(a)
});
},
onerror:function(t){
var i=void 0,r=+new Date,a=r-o;
switch(1*t){
case 400:
i=-22;
break;

case 500:
i=-21;
break;

default:
i=-23;
}
"function"==typeof e.onError&&e.onError(i,{
ret_code:i,
c_time:a,
err_msg:d(-1)
}),V.getinfoReport({
vid:e.vid,
val:a,
val1:i,
vurl:""
});
}
});
}
var i="https://h5vv6.video.qq.com/getvinfo?vid=#vid#&dtype=1&otype=json&callback=video_dynamic_callback&appVer=1&encryptVer=6.3&platform=61001&cKey=#ckey#&sdtfrom=#sdtfrom#";
i=i.replace("#vid#",e.vid).replace("#ckey#",e.ckey).replace("#sdtfrom#",V.getsdtfrom()),
i=i+"&device="+V.getPlatformType()+"&use_proxy_sdk="+(z.isUseProxy()?1:0);
var o=+new Date;
n(t);
}
function d(e,t){
var i="";
switch(1*e){
case-4:
i="因版权限制，该视频不支持播放";
break;

case-5:
i="因版权限制，该视频不支持播放";
break;

case-3:
i="因版权限制，该视频不支持播放";
break;

case 61:
i="当前视频不存在，暂无法观看";
break;

case 62:
i="当前视频已下架，暂无法观看";
break;

case 63:
i="视频加载失败，暂无法观看";
break;

case 65:
i="视频加载失败，暂无法观看";
break;

case 67:
i="视频加载失败，暂无法观看";
break;

case 69:
i="视频格式不支持移动端观看，请在电脑上观看";
break;

case 71:
i="视频加载失败，暂无法观看";
break;

case 73:
i="视频加载失败，暂无法观看";
break;

case 74:
i="视频加载失败，暂无法观看";
break;

case 80:
switch(1*t){
case 1:
i="很抱歉，当前IP地址所在地区暂不支持播放";
break;

case 2:
i="因版权限制，暂不支持播放";
break;

default:
i="因版权限制，该视频不支持播放";
}
break;

case 81:
i="视频加载失败，暂无法观看";
break;

case 82:
i="视频加载失败，暂无法观看";
break;

case 83:
switch(1*t){
case-1:
i=N;
break;

case-2:
i="因版权限制，该视频不支持播放";
break;

default:
i="该片为付费视频，请前往腾讯视频观看";
}
break;

case 84:
i="很抱歉，根据您的IP地址，暂无法播放";
break;

default:
i=N;
}
return i;
}
function _(e){
var t="https://h5vv.video.qq.com/getextinfo?otype=json&callback=video_static_callback&vid="+e.vid;
M({
url:t,
timeout:3e4,
callbackName:"video_static_callback",
callback:function(t){
if(!t||"o"!=t.s||t.vl.cnt<=0)return void("function"==typeof e.onError&&e.onError(-1));
var i=t.vl.vi[0],o={
title:i.title||"视频",
desc:1*i.desc===0?"":i.desc||"",
director:i.director||"",
leading_actor:i.leading_actor||"",
costar:i.costar||"",
time:Math.floor(i.td)||0
};
if(i.pl&&i.pl.cnt>0){
var r=i.pl.pi;
o.p400_300=r[0]?r[0].url:"",o.p140_100=r[1]?r[1].url:"",o.p120_90=r[2]?r[2].url:"",
o.p400_300=o.p400_300&&-1==o.p400_300.indexOf("http")?"http://"+o.p400_300:o.p400_300,
o.p140_100=o.p140_100&&-1==o.p140_100.indexOf("http")?"http://"+o.p140_100:o.p140_100,
o.p120_90=o.p120_90&&-1==o.p120_90.indexOf("http")?"http://"+o.p120_90:o.p120_90;
}
e.onSuc(o);
},
onerror:function(t){
"function"==typeof e.onError&&e.onError(t);
}
});
}
function c(e){
for(var t=1e8,i=0,o=0,r=e.length;r>o;o++)i=(i<<5)+i+e.charCodeAt(o);
return i%t;
}
function p(e,t,i){
return i?"/mp/videoplayer?action=get_mp_video_cover&vid="+e:location.protocol+"//puui.qpic.cn/vpic_cover/"+e+"/"+e+"_hz.jpg";
}
function g(e,t,i,o){
var r=x.get(Q.cachekey+o);
if(!r)return null;
try{
if(r=JSON.parse(r)||{},!r.time||Date.now()-Q.cacheTime>1*r.time)return f(o),r.videoInfo={
status:u(e,t,i,o)
},r;
}catch(a){
return f(o),null;
}
return r=r.videoInfo?r:{
videoInfo:{}
},r.videoInfo.status=u(e,t,i,o),r.videoInfo?r:null;
}
function u(e,t,i,o){
var r=x.get(Q.cachekey+e+t+i+o);
if(!r)return null;
try{
r=JSON.parse(r)||{};
}catch(a){
return m(e,t,i,o),null;
}
return r;
}
function l(){
var e=x.get(Q.cachekey+"playerStatus");
if(e){
try{
e=JSON.parse(e)||{};
}catch(t){
return void f("playerStatus");
}
e.playerStatus&&(Q.playerStatus=e.playerStatus,console.log("get player status cache",Q.playerStatus));
}
}
function h(e,t,i,o,r,a){
var n={
dynamicData:r.dynamicData||null,
coverUrl:r.coverUrl||""
};
x.set(Q.cachekey+o,JSON.stringify({
time:a||Date.now(),
videoInfo:n
})),r.status&&x.set(Q.cachekey+e+t+i+o,JSON.stringify(r.status));
}
function v(){
x.set(Q.cachekey+"playerStatus",JSON.stringify({
playerStatus:Q.playerStatus
}));
}
function f(e){
x.remove(Q.cachekey+e);
}
function m(e,t,i,o){
x.remove(Q.cachekey+e+t+i+o);
}
function y(e){
return document.getElementById(e);
}
function w(e,t){
for(var i in t)e[i]=t[i];
}
function b(){
t(),i(),l();
}
var k=window.withoutIframe?window:window.parent.window;
-1!=location.href.indexOf("__td=qq.com")&&(document.domain="qq.com"),e("biz_wap/zepto/zepto.js"),
e("biz_wap/zepto/event.js"),e("biz_wap/zepto/touch.js"),e("biz_wap/ui/weui.js"),
e("biz_common/utils/string/html.js");
var P=e("a/a_utils.js"),T=e(window.withoutIframe?"appmsg/without_iframe/iframe_communicate.js":"pages/iframe_communicate.js"),D=e("biz_wap/jsapi/core.js"),I=e("biz_wap/utils/mmversion.js"),R=e("biz_common/utils/url/parse.js"),S=e("biz_wap/utils/ajax.js"),M=e("pages/loadscript.js"),j=e("pages/video_plugin/video_monitor.js"),x=e("biz_wap/utils/localstorage.js"),C=e("biz_wap/utils/storage.js"),z=e("pages/version4video.js"),U=e("biz_common/dom/event.js"),V=e("pages/report.js"),E=e("new_video/plugin/proxy.js"),L=e("new_video/plugin/ad.js"),O=e("new_video/plugin/danmu.js"),A=e("new_video/player.js"),B=e("new_video/ctl.js"),q=e("biz_common/tmpl.js"),W=e("pages/video_error.html.js"),N="视频加载失败，请刷新页面重试",F=e("pages/create_txv.js"),H=e("biz_wap/utils/jsmonitor_report.js"),G=e("biz_wap/jsapi/leaveReport.js"),J=e("biz_wap/jsapi/log.js"),Q={
isUseProxy:z.isUseProxy(),
isWechat:I.isWechat,
isAndroid:I.isAndroid,
isIOS:I.isIOS,
isGoTx:k.location.href.indexOf("&_gotx=1")>0,
_debug:k.location.href.indexOf("&vconsole=1")>0,
cachekey:"qqmovieStatus_",
videoDataLs:null,
videoDataLsExpTime:864e7,
cacheTime:6e5,
videoInfo:{},
videoInstance:[],
neeedTimoutSaveReportData:!0,
networkType:"",
isPc:/(WindowsNT)|(Windows NT)|(Macintosh)/i.test(navigator.userAgent),
hasLeaveReport:!1,
playerStatus:{
formatId:null
}
},K={
"network_type:fail":"fail",
"network_type:edge":"2g/3g",
"network_type:wwan":"2g/3g",
"network_type:wifi":"wifi"
};
b(),o.prototype._init=function(e){
function i(){
try{
if(window.withoutIframe){
for(var e=k.document.getElementsByClassName("video_iframe"),t=0;t<e.length;t++)if(n._o.vid===e[t].getAttribute("vid")&&e[t].adVidFromAppmsg)return!0;
}else for(var e=k.document.getElementsByTagName("iframe"),t=0;t<e.length;t++)if(window===e[t].contentWindow&&e[t].adVidFromAppmsg||e[t].adVidFromAppmsg===window.realVid&&window.realVid)return!0;
}catch(i){
console.log(i);
}
}
var o=this;
e=e||{},this.destroy(),Q.videoInstance.push(this),this._report=V.getVideoReportData(),
this._g={
gWidth:e.gWidth||this._o.width,
gHeight:e.gHeight||this._o.height,
playRangeInfo:[],
dynamicErrMsg:"",
hasReportProxyError:e.hasReportProxyError===!0,
noProxy:e.noProxy===!0,
hasDestroy:!1,
reportDataTimeoutId:null,
reportDataLsKey:this._o.vid+"_"+Math.random(),
hasReport:!1,
isShowTx:!1,
dataCount:0,
targetDataCount:2,
coverUrl:"",
cacheStartTs:0,
vInfo:{
status:null,
coverUrl:"",
dynamicData:null,
is_report_pv:!1
},
dom:{
page_content:y("page-content"),
js_mpvedio:y("js_mpvedio")
},
initialData:null
},this._getRatio(),this._initPlugins(e),this._initReportData(),this._defineEvent(),
P.report115849(71);
var r=setInterval(function(){
i()&&(P.report115849(75),P.report115849(76),clearInterval(r));
},500);
if(this._isGotoTx()===!0)return void P.report115849(70);
this._getCache(),window.__timelineInitialData?(this._g.initialData=window.__timelineInitialData,
this._setCoverUrl()):this._setCoverUrl(),this._cacheOnPageInvisible();
var a=setInterval(function(){
i()&&(P.report115849(83),P.report115849(84),clearInterval(a));
},500);
this._reportH265VideoSupport();
var n=this;
z.isUseAd()&&this._o.noAd!==!0&&(this._g.myAdPlugin=new L({
fromid:this._o.fromid,
videoReportType:this.getReportTypeBySceneType(),
isMpVideo:n._o.is_mp_video,
vid:this._o.vid,
ratio:this._o.ratio,
oriVid:this._o.oriVid,
tmpGetAd:function(e,t){
s({
vid:"b0163rzlnn7",
ckey:n._o.ckey_ad,
onSuc:function(t){
e&&e(t);
},
onError:function(){
t&&t();
}
});
}
})),this._cacheReportData();
var d=!1;
return"undefined"!=typeof Promise&&(d=!0),this._o.fakePlayer?(this._trigger("setMonitor",this._g.monitorUid2,{
76:1
}),void this._trigger("sendMonitor",this._g.monitorUid2)):void(Q.isWechat&&!Q.networkType&&Q.playerStatus&&!Q.playerStatus.formatId&&d?(t().then(function(){
o._getDynamic();
}).catch(function(){
o._getDynamic();
}),setTimeout(function(){
o.hasInitNetwork||o._getDynamic();
},5e3)):this._getDynamic());
},o.prototype._getRatio=function(){
for(var e=this._o.width/this._o.height,t=[4/3,16/9],i=t[0],o=Math.abs(i-e),r=1,a=t.length;a>r;r++){
var n=Math.abs(t[r]-e);
o>n&&(o=n,i=t[r]);
}
this._o.ratio=i;
},o.prototype._isGotoTx=function(){
var e=this,t=this._o;
if((!t.ckey||Q.isGoTx)&&!t.is_mp_video){
e._g.isShowTx=!0;
var i=$(this._o.container),o=i.attr("id");
o||(o="js_tx_video_container_"+Math.random(),i.attr("id",o)),F.createTxVideo({
win:window,
containerId:o,
vid:t.vid,
width:e._g.gWidth,
height:e._g.gHeight,
autoplay:!1,
allowFullScreen:!0,
onSuccess:function(t){
e._g.txPlayer=t.player,e._g.dataCount=e._g.targetDataCount,e.videoDataReady();
},
onError:function(){}
});
var r=this._g.monitorUid;
if(1==window.is_login)this._trigger("setMonitor",r,{
38:1
});else if(this._trigger("setMonitor",r,{
39:1
}),1===k.is_login){
var a=JSON.stringify({
tag:"video_player_login_status",
uin:window.user_uin,
bizUin:encodeURIComponent(t.__biz),
appmsgBizUin:encodeURIComponent(k.biz),
appmsgUserUin:k.user_uin,
isSecOpen:!!k.__second_open__
});
H.setLogs({
id:115849,
key:73,
value:1,
lc:1,
log0:a
});
}
return this._trigger("sendMonitor",r),!0;
}
return!1;
},o.prototype._reportH265VideoSupport=function(){
var e=this._g.monitorUid2;
this._trigger("setMonitor",e,{
36:1
});
var t=document.createElement("video");
if("function"==typeof t.canPlayType){
var i=t.canPlayType('video/mp4; codecs="hevc"');
("maybe"==i.toLowerCase()||"probably"==i.toLowerCase())&&this._trigger("setMonitor",e,{
37:1
});
}
this._trigger("sendMonitor",e);
},o.prototype._initPlugins=function(){
var e=arguments.length<=0||void 0===arguments[0]?{}:arguments[0];
if(!e.hasInitPlugins){
var t=this._o.plugins||[];
t.push(new j),this._blockPlugin={};
for(var i=0,o=t.length;o>i;++i){
var r=t[i];
r.setPlayer(this),!!r.init&&r.init();
}
this.plugins=t;
}
},o.prototype.isInFullScreen=function(){
return this._g.myPlayer?this._g.myPlayer.isInFullScreen():!1;
},o.prototype._initReportData=function(){
var e=this._report,t=this._o;
e.mid=t.mid,e.__biz=t.__biz,e.idx=t.idx,e.vid=t.vid,e.commentid=t.comment_id,e.scene_type=t.scene_type,
e.auto_play=t.autoplay?1:0,e.fromid=t.fromid,e.hit_bizuin=t.hit_bizuin,e.hit_vid=t.hit_vid,
this._g.monitorUid=this._trigger("initMonitor",64728),this._g.monitorUid2=this._trigger("initMonitor",110644);
},o.prototype._initPlayRangeInfo=function(e){
function t(e,t){
for(var i=[{
start:0,
end:e,
hasReport:!1
}];;){
var o=i[i.length-1];
if(o.end>=t)break;
i.push({
start:o.end,
end:o.end+e,
hasReport:!1
});
}
return i;
}
if(!(e.durationMs<=0)){
var i=this._o.totalRange;
this._g.playRangeInfo=1e3*i>=e.durationMs?t(1e3,e.durationMs):t(Math.ceil(e.durationMs/i),e.durationMs);
}
},o.prototype._reportCurRangeInfo=function(e){
var t=this._g.playRangeInfo;
if(t&&0!==t.length)for(var i=t.length,o=this._o,r=0;i>r;r++){
var a=t[r];
if(a.start<e.curTime&&a.end>=e.curTime){
a.hasReport||(a.hasReport=!0,B.report({
step:14,
vid:o.vid,
hit_bizuin:o.hit_bizuin,
hit_vid:o.hit_vid,
traceid:this._getTraceId(),
orderid:this._getOrderid(),
ori_status:this._getOriStatus(),
type:this.getReportTypeBySceneType(),
fromid:this._getFromid(),
total_range:i,
current_range:r+1,
duration:this._report.duration_ms||t[i-1].end
}));
break;
}
}
},o.prototype._defineEvent=function(){
var e=this;
this._g.event={
afterRemoveLoading:function(){
e._afterRemoveLoading();
}
};
},o.prototype.videoDataReady=function(){
var e=this;
return this._o.fakePlayer?void this._createFakePlayer():void(this._g.dataCount===this._g.targetDataCount&&(this._g.isShowTx?this._removeLoading():this._g.vInfo.dynamicData?this._createPlayer({
onLoaded:function(){
setTimeout(function(){
e._removeLoading();
},0);
}
}):(this._removeLoading(),J.error("qq_video_info: failed to create player because no dynamic data"))));
},o.prototype._removeLoading=function(){
this._o.isInIframe?(T.addListener({
type:"afterRemoveLoading",
func:this._g.event.afterRemoveLoading,
vid:this._o.oriVid
}),T.postMessage({
type:"removeVideoLoading",
data:{
vid:this._o.oriVid
}
})):this._afterRemoveLoading();
},o.prototype._afterRemoveLoading=function(){
if(!this._g.isShowTx&&!this._g.vInfo.dynamicData)if(this._o.is_mp_video){
var e=1;
(72==this._report.videoerror||73==this._report.videoerror)&&(e=2),this._showError(this._g.dynamicErrMsg,e);
}else this._showError(this._g.dynamicErrMsg||"");
T.removeListener({
type:"afterRemoveLoading",
func:this._g.event.afterRemoveLoading
}),this._bindResize(),this._o.onReady.call(this),this._trigger("videoReady");
},o.prototype._setCoverUrl=function(){
function e(){
S({
type:"GET",
dataType:"json",
timeout:3e4,
url:a,
success:function(e){
e&&e.base_resp&&0==e.base_resp.ret&&e.url&&(i._g.coverUrl=e.url),i._g.dataCount++,
i.videoDataReady();
},
error:r
});
}
var t="";
if(this._g.initialData&&this._g.initialData.initialCover?t=this._g.initialData.initialCover:this._o.is_mp_video&&window.__mpVideoCoverUrl?t=window.__mpVideoCoverUrl:this._g.vInfo.coverUrl&&(t=this._g.vInfo.coverUrl),
t)return this._g.coverUrl=t,this._g.dataCount++,void this.videoDataReady();
if(this._g.coverUrl=this._getCover(),!this._o.is_mp_video)return this._g.dataCount++,
void this.videoDataReady();
var i=this,o=1,r=function(){
return o>0?(o--,void e()):(i._g.dataCount++,void i.videoDataReady());
},a=this._g.coverUrl+"&f=json";
e();
},o.prototype._getDynamic=function(){
var e=this,t=this._o,i=this._g;
if(e.hasInitNetwork=!0,t.is_mp_video&&window.__mpVideoTransInfo&&window.__mpVideoTransInfo.length>0)return i.dataCount++,
i.vInfo.dynamicData={
data:r({
url_info:window.__mpVideoTransInfo.map(function(e){
return e.url=e.url.htmlDecode(),e.url=e.url.replace(/^http(s?):/,location.protocol),
e;
})
})
},void this.videoDataReady();
if(i.vInfo.dynamicData){
i.dataCount++;
var o=i.vInfo.dynamicData;
return this._report.getvinfo_ret="undefined"!=typeof o.ret_code?o.ret_code:-2,this._report.getvinfo_time=o.c_time||0,
t.is_mp_video&&o.data&&o.data.ori_url_info&&o.data.ori_url_info.length>0&&(i.vInfo.dynamicData={
data:r({
url_info:o.data.ori_url_info
})
}),void this.videoDataReady();
}
var n=this._report,d=i.monitorUid,_=i.monitorUid2;
return t.is_mp_video?void a({
preview:t.preview,
vid:t.vid,
__biz:t.__biz,
mid:t.mid,
idx:t.idx,
auto:!(!Q.isAndroid||!I.gtVersion("7.0.16",1)),
onSuccess:function(t){
e._trigger("setMonitor",_,{
93:1,
94:1
}),e._trigger("sendMonitor",_),i.dataCount++,i.vInfo.dynamicData=t,e.videoDataReady();
},
onError:function(t){
switch(e._trigger("setMonitor",_,{
93:1,
95:1
}),1*t.code){
case 80:
e._trigger("setMonitor",_,{
86:1,
92:1
});
break;

case 81:
e._trigger("setMonitor",_,{
86:1,
91:1
});
break;

case 82:
e._trigger("setMonitor",_,{
86:1,
90:1
});
break;

case 83:
e._trigger("setMonitor",_,{
86:1,
89:1
});
break;

case 84:
e._trigger("setMonitor",_,{
86:1,
88:1
});
break;

case 85:
e._trigger("setMonitor",_,{
86:1,
87:1
});
break;

case 71:
e._trigger("setMonitor",_,{
78:1
});
break;

case 72:
e._trigger("setMonitor",_,{
79:1
});
break;

case 73:
e._trigger("setMonitor",_,{
80:1
});
break;

case 74:
e._trigger("setMonitor",_,{
85:1
});
break;

case 75:
e._trigger("setMonitor",_,{
81:1
});
break;

case 76:
e._trigger("setMonitor",_,{
82:1
});
break;

case 79:
e._trigger("setMonitor",_,{
77:1
});
}
e._trigger("sendMonitor",_),n.videoerror=t.code,e._g.dynamicErrMsg=t.err_msg||"",
n.duration_ms=0,i.vInfo.dynamicData=null,e._g.dataCount=e._g.targetDataCount,e.videoDataReady();
}
}):void s({
vid:t.vid,
ckey:t.ckey,
onSuc:function(t){
if(e._trigger("setMonitor",d,{
10:1,
11:1,
13:Math.min(t.c_time,6e4)
}),t.data.width&&t.data.height){
var o=Math.round(10*t.data.width/t.data.height*1);
o>20?o=20:0>o&&(o=0);
var r=41+2*o,a={};
a[r]=1,e._trigger("setMonitor",d,a);
}else e._trigger("setMonitor",d,{
83:1
});
e._trigger("sendMonitor",d),i.dataCount++,i.vInfo.dynamicData=t,n.getvinfo_ret=t.ret_code,
n.getvinfo_time=t.c_time,n.file_size=t.data.file_size,n.rate=t.data.rate,n.resolution=t.data.resolution,
n.format=t.data.format,n.vt=t.data.vt,n.video_ext=V.getsdtfrom(),e.videoDataReady();
},
onError:function(t,o){
if(e._trigger("setMonitor",d,{
10:1,
12:1,
13:Math.min(o.c_time,6e4)
}),-2==t)switch(1*o.ret_code){
case-2:
e._trigger("setMonitor",d,{
17:1
}),n.videoerror=2;
break;

case-3:
e._trigger("setMonitor",d,{
40:1
}),n.videoerror=53;
break;

case-4:
e._trigger("setMonitor",d,{
109:1
}),n.videoerror=54;
break;

case-5:
e._trigger("setMonitor",d,{
110:1
}),n.videoerror=55;
break;

case 61:
e._trigger("setMonitor",d,{
18:1
}),n.videoerror=25;
break;

case 62:
e._trigger("setMonitor",d,{
19:1
}),n.videoerror=26;
break;

case 64:
e._trigger("setMonitor",d,{
20:1
}),n.videoerror=27;
break;

case 67:
e._trigger("setMonitor",d,{
21:1
}),n.videoerror=28;
break;

case 69:
e._trigger("setMonitor",d,{
22:1
}),n.videoerror=52;
break;

case 80:
e._trigger("setMonitor",d,{
23:1
}),n.videoerror=29;
break;

case 81:
e._trigger("setMonitor",d,{
24:1
}),n.videoerror=50;
break;

case 85:
e._trigger("setMonitor",d,{
25:1
}),n.videoerror=51;
break;

default:
e._trigger("setMonitor",d,{
26:1
}),n.videoerror=24;
}else{
switch(1*t){
case-22:
e._trigger("setMonitor",d,{
15:1
});
break;

case-21:
e._trigger("setMonitor",d,{
14:1
});
break;

case-23:
e._trigger("setMonitor",d,{
16:1
});
}
n.videoerror=-1*t;
}
e._trigger("sendMonitor",d),e._g.dynamicErrMsg=o.err_msg||"",n.getvinfo_ret=o.ret_code,
n.duration_ms=0,n.getvinfo_time=o.c_time||0,i.vInfo.dynamicData=null,e._g.dataCount=e._g.targetDataCount,
e.videoDataReady();
}
});
},o.prototype._createFakePlayer=function(){
var t=this._o.container,i=this._g.coverUrl,o=["width: 100%;","height: 100%;","background: center / contain no-repeat black url('"+i+"');"].join(" "),r=['<div class="video_player page_video fake" style="'+o+'">','<div class="full_screen_opr">','<div class="mid_play_box">','<div class="icon_mid_play"></div>',"</div>","</div>","</div>"].join("");
e("page/pages/video_new.css");
var a=$(r);
$(t).append(a);
},o.prototype._createPlayer=function(){
var e=arguments.length<=0||void 0===arguments[0]?{}:arguments[0],t=this,i=this._g,o=this._o,r=i.vInfo||{},a=this._report,n=r&&r.dynamicData&&r.dynamicData.data||{},s=[];
i.myAdPlugin&&s.push(i.myAdPlugin),i.noProxy!==!0&&Q.isUseProxy&&s.push(new E({
vid:o.vid,
data:n,
cdn_url:n.totalUrl
})),o.useDanmu===!0&&s.push(new O({
bizUin:this.cgiData.biz,
msgId:1*this.cgiData.mid,
idx:1*this.cgiData.idx,
vid:o.vid
})),a.duration_ms=parseInt(1e3*n.time),this._initPlayRangeInfo({
durationMs:a.duration_ms
}),a.vtitle=this.cgiData&&this.cgiData.video_title&&this.cgiData.video_title.htmlDecode()||n.title||"";
var d=!1,_=i.monitorUid,c=i.monitorUid2,p=t.getReportTypeBySceneType(),g=void 0;
n.ori_url_info&&!function(){
var e={
10002:"超清",
10003:"高清",
10004:"流畅",
20003:"自动"
};
g=[],n.ori_url_info.forEach(function(t){
(1*t.format_id!==20003||Q.isWechat&&Q.isAndroid&&I.gtVersion("7.0.16",1))&&g.push({
name:t.video_quality_wording||e[t.format_id],
formatId:t.format_id,
height:t.height,
width:t.width,
src:t.url
});
});
}();
var u=[{
rate:.5,
name:"0.5倍"
},{
rate:.75,
name:"0.75倍"
},{
rate:1,
name:"1.0倍"
},{
rate:1.5,
name:"1.5倍"
},{
rate:2,
name:"2.0倍"
}],l=R.getQuery("play_time"),h=0;
i.initialData?h=i.initialData.initialTime||0:""!==l?h=1*l||0:r.status&&!r.status.isEnd&&(h=r.status.playTime||0),
J.info("qq_video_info: begin to create player"),i.myPlayer=new A({
__biz:o.__biz,
mid:o.mid,
idx:o.idx,
bizUserName:o.bizUserName,
bizNickName:o.bizNickName,
videoTitle:a.vtitle,
videoReportType:p,
defineCSS:!0,
container:o.container,
cover:i.coverUrl,
ratio:o.ratio,
width:i.gWidth,
height:i.gHeight,
videoWidth:n.width,
videoHeight:n.height,
duration:n.time,
autoplay:o.autoplay,
autoReplay:o.autoReplay,
isVideoSharePage:o.isVideoSharePage,
flowNotice:o.flowNotice,
flow:n.flow,
loop:o.loop,
plugins:s,
src:n.totalUrl,
formatId:n.formatid,
headImgUrl:o.headImgUrl,
jsapiFullScreen:o.jsapiFullScreen,
canShareVideo:o.canShareVideo,
pauseShowControll:o.pauseShowControll,
videoMd5:o.videoMd5,
useWcSlPlayer:o.useWcSlPlayer,
initialTime:h,
resolutionInfo:g,
playbackRateInfo:u,
playbackRateBtnInfoDefaultId:2,
cgiData:this.cgiData,
extinfo:{
hit_bizuin:o.hit_bizuin,
hit_vid:o.hit_vid,
vid:o.vid,
preview:o.preview,
pageplayer:t
},
isTLpage:o.isTLpage||!1,
muted:o.muted||!1,
fileSize:n.file_size,
onLoaded:function(){
"function"==typeof e.onLoaded&&e.onLoaded(),J.info("qq_video_info: succ created player");
},
onTimeupdate:function(e,r){
if(!d){
d=!0,B.report({
step:6,
vid:o.vid,
traceid:t._getTraceId(),
orderid:t._getOrderid(),
type:p,
fromid:t._o.fromid
});
var n=this.getLog(),s=n.loadwait||0;
t._qqVideoReport({
step:6,
loadwait:s
});
}
i.is_report_pv||(i.is_report_pv=!0,t._trigger("clearMonitor",_),t._trigger("clearMonitor",c),
t._o.is_mp_video?(t._trigger("setMonitor",c,{
12:1,
13:1
}),t._trigger("sendMonitor",c)):(t._trigger("setMonitor",_,{
0:1,
1:1
}),t._trigger("sendMonitor",_))),a.last_ms=parseInt(1e3*r.currentTime),a.video_play_time=parseInt(1e3*r.currentTime),
t._reportCurRangeInfo({
curTime:a.last_ms
}),t._trigger("timeupdate",r);
},
onBeginPlay:function(){
var e=r.status,i=this;
1*h>0&&1*h<.99*n.time&&(i.play(h),e&&e.playTime&&(e.playTime=0)),a.client_time_when_play=Math.round(+new Date/1e3),
a.click_play_button=1,"string"==typeof o.container&&"#"==o.container.charAt(0)&&"number"==typeof o.__count__&&o.__hasReport===!1&&(0==o.__count__?(new Image).src="/mp/jsreport?key=103&content=video_test&r="+Math.random():1==o.__count__?(new Image).src="/mp/jsreport?key=104&content=video_test&r="+Math.random():o.__count__>=2&&((new Image).src="/mp/jsreport?key=105&content=video_test&r="+Math.random()),
o.__hasReport=!0),t._trigger("beginPlay");
},
onDurationchange:function(){
if(this._useWcSlPlayer()){
var e=r.status;
e&&1*e.playbackRate!==1&&(this.setPlaybackRate(e.playbackRate),e.playbackRate=1);
}
},
onFullscreenchange:function(e,i){
t._trigger("fullscreenchange",i);
},
onAriaReplay:function(){
t._trigger("ariaReplay");
},
onStatusChange:function(e,i){
"loading"!==i.status||"seeked"!==i.subStatus&&"seeking"!==i.subStatus||t._initPlayRangeInfo({
durationMs:a.duration_ms
}),t._trigger("statusChange",i);
},
onAfterReplay:function(){
t._trigger("afterReplay");
},
onHandDragComplete:function(e,i){
t._trigger("handDragComplete",i);
},
onBarDragComplete:function(e,i){
t._trigger("barDragComplete",i);
},
onEnd:function(){
this.hideControllBar(),this.autoChangeTip({
type:"autoChange",
option:"hide"
}),this.autoChangeTip({
type:"autoSuc",
option:"hide"
}),a.hasended=1,B.report({
step:7,
vid:o.vid,
ext1:1e3*n.time,
traceid:t._getTraceId(),
orderid:t._getOrderid(),
type:p,
fromid:t._o.fromid,
duration:a.duration_ms,
cgiData:this.cgiData
}),t._debug("onend isend:"+this.isEnd()),t._trigger("hidePauseTips"),t._trigger("showEndContent"),
t._reportCurRangeInfo({
curTime:a.last_ms
}),t._initPlayRangeInfo({
durationMs:a.duration_ms
}),o.onEnd&&o.onEnd.call(this);
},
onError:function(e,o){
if(a.videoerror=!o||!o.errorcode||o.errorcode>5||o.errorcode<=0?46:o.errorcode+40,
Q.isUseProxy&&!t._g.noProxy?Q.isAndroid?t._trigger("setMonitor",c,{
30:1
}):Q.isIOS&&t._trigger("setMonitor",c,{
32:1
}):Q.isUseProxy&&t._g.noProxy&&!t._g.hasReportProxyError&&(t._g.hasReportProxyError=!0,
Q.isAndroid?t._trigger("setMonitor",c,{
31:1
}):Q.isIOS&&t._trigger("setMonitor",c,{
33:1
})),t._o.is_mp_video){
switch(i.is_report_pv||(i.is_report_pv=!0,t._trigger("setMonitor",c,{
12:1
})),t._trigger("setMonitor",c,{
14:1
}),1*o.errorcode){
case 1:
t._trigger("setMonitor",c,{
15:1
});
break;

case 2:
t._trigger("setMonitor",c,{
16:1
});
break;

case 3:
t._trigger("setMonitor",c,{
17:1
});
break;

case 4:
t._trigger("setMonitor",c,{
18:1
});
break;

case 5:
t._trigger("setMonitor",c,{
19:1
});
break;

case 6:
t._trigger("setMonitor",c,{
39:1
});
break;

default:
t._trigger("setMonitor",c,{
20:1
});
}
t._trigger("sendMonitor",c);
}else{
switch(i.is_report_pv||(i.is_report_pv=!0,t._trigger("setMonitor",_,{
0:1
})),t._trigger("setMonitor",_,{
2:1,
3:1
}),1*o.errorcode){
case 1:
t._trigger("setMonitor",_,{
4:1
});
break;

case 2:
t._trigger("setMonitor",_,{
5:1
});
break;

case 3:
t._trigger("setMonitor",_,{
6:1
});
break;

case 4:
t._trigger("setMonitor",_,{
7:1
});
break;

case 5:
t._trigger("setMonitor",_,{
8:1
});
break;

default:
t._trigger("setMonitor",_,{
9:1
});
}
t._trigger("sendMonitor",_),t._trigger("sendMonitor",c);
}
a.v_err_code=o.errorcode,t._showError(),t._qqVideoReport({
step:1999,
val:a.videoerror
}),t._initPlayRangeInfo({
durationMs:a.duration_ms
});
},
onFirstBufferingTime:function(e,i){
t._trigger("firstBufferingTime",i);
},
onPlayingBufferingTime:function(e,i){
t._trigger("playingBufferingTime",i);
},
onFlowNotice:function(e,i){
t._trigger("flowNotice",i);
},
onUserplay:function(e,i){
t._trigger("userplay",i);
},
onUserpause:function(e,i){
t._trigger("userpause",_extends({
curTime:this.getCurTime()
},i)),a.pause_num=(a.pause_num||0)+1;
},
onWaiting:function(e,o){
if(Q.isWechat&&Q.isAndroid&&I.gtVersion("7.0.16",1)){
var r={
10004:1,
10003:2,
10002:3,
20003:4
},a={
"自动":"20003",
"超清":"10002",
"高清":"10003",
"流畅":"10004"
},n={
WiFI:1,
"2G":2,
"3G":3,
"4G":4
};
o&&!function(){
for(var e=3,s=i.myPlayer,d=s.getResolutionInfo(),_=d?d.src:null,c=t._o.auto.loadRetryTime,p=t._o.auto.isShowTip,g=null,u=5e3,l=$(".js_auto_change_tip_mask")[0],h=void 0,v=void 0,f=i.vInfo.dynamicData?i.vInfo.dynamicData.data.ori_url_info.map(function(e){
var t=e.video_quality_wording,i=a[t];
return{
formatId:i,
src:e.url,
name:t
};
}):[],m=0;m<f.length;m++)"20003"===f[m].formatId&&(h=f[m].src),f[m].src===_&&(v=r[[f[m].formatId]]);
var y=function(e){
var i=$(".js_auto_change_tip")[0];
U.tap(i,function(){
t._o.auto.isChangeAuto=!0,t._trigger("autoTip",{
networkType:networkType,
DefinitionBefore:e.definitionBefore
});
});
},w=function(){
U.on(l,"tap",function(e){
e.cancelBubble=!0,i.myPlayer.autoChangeTip({
type:"autoChange",
option:"hide"
}),s.hideControllBar();
});
},b=function(){
g&&clearTimeout(g),g=setTimeout(function(){
i.myPlayer.autoChangeTip({
type:"autoChange",
option:"hide"
});
},u);
},k=function(){
s.hideControllBar(),i.myPlayer.autoChangeTip({
type:"autoChange",
option:"show"
}),p=!0;
var e=-1;
D.invoke("getNetworkType",{},function(t){
e=n[K[t.err_msg]]||0,("network_type:edge"==t.err_msg||"network_type:wwan"==t.err_msg)&&(t.detailtype||t.subtype)&&(e=n[t.detailtype]||n[t.subtype]);
}),y({
networkType:e,
definitionBefore:v
}),t._trigger("showTip");
},P=o.action;
_!==h&&h&&(p||("changeToAuto"===P||++c>e?(k(),b(),w()):t._o.auto.loadRetryTime+=1)),
t._o.auto.isShowTip=p;
}();
}
},
onPlay:function(e,o){
console.log("[onPlaying]",i.myPlayer.getResolutionInfo()),t._o.auto.isChangeAuto===!0&&t._o.auto.isShowSuc===!1&&i.myPlayer.getResolutionInfo()&&i.myPlayer.getResolutionInfo().src.indexOf("m3u8")&&!function(){
var e=null,o=4e3,r=function(){
e&&clearTimeout(e),e=setTimeout(function(){
i.myPlayer.autoChangeTip({
type:"autoSuc",
option:"hide"
});
},o);
};
i.myPlayer.hideControllBar(),i.myPlayer.autoChangeTip({
type:"autoSuc",
option:"show"
}),r(),t._o.auto.isShowSuc=!0;
}(),t._trigger("play",o);
},
onAfterCheckVideoFit:function(e,i){
var o={
97:1
};
i.needToFit===!0&&(o[98]=1,o[100]=1,i.os.ios&&(o[103]=1),i.os.android&&(o[106]=1),
i.supportObjectFit===!0&&(o[101]=1,i.os.ios&&(o[104]=1),i.os.android&&(o[107]=1))),
t._trigger("setMonitor",_,o),t._trigger("sendMonitor",_);
},
onBindError:function(e,i){
t._trigger("bindError",i);
},
onRateChange:function(e,i){
t._trigger("rateChange",i);
},
onResolutionChange:function(e,i){
"changed"===i.action&&(Q.playerStatus.formatId=i.infoAfter&&i.infoAfter.formatId||null,
D.invoke("handleMPPageAction",{
action:"setLocalData",
key:"formatId",
data:String(Q.playerStatus.formatId)
},function(e){
console.log("setLocalData"+JSON.stringify(e));
}),v()),t._trigger("resolutionChange",i);
},
onBrightnessChange:function(e,i){
t._trigger("brightnessChange",i);
},
onVolumeChange:function(e,i){
t._trigger("volumeChange",i);
},
onProfileJump:function(e,i){
t._trigger("profileJump",i);
},
onProcessStateChange:function(e,i){
t._trigger("processStateChange",i);
},
onGetDanmuInfo:function(e,i){
t._trigger("getDanmuInfo",i);
},
onCanplay:function(e,i){
t._trigger("canplay",i);
},
onShowControllBar:function(e,i){
t._trigger("showControlBar",i);
},
onHideControllBar:function(e,i){
t._trigger("hideControlBar",i);
},
canMePlay:function(e){
o.checkNoPaid?S({
type:"GET",
dataType:"json",
timeout:3e4,
url:"/mp/videoplayer?action=check_video_paid_status&__biz="+o.__biz+"&mid="+o.mid+"&idx="+o.idx,
success:function(t){
var i=1==t.can_play;
i?e():window.weui.confirm("此视频来自于付费内容，在原文付费后才可播放",{
buttons:[{
type:"default",
label:"取消"
},{
label:"前往原文",
onClick:function(){
o.openArticle();
}
}]
});
},
error:function(e){
var t=void 0;
t=e?e.status>=200&&e.status<400?81:e.status>=400&&e.status<500?82:e.status>=500&&e.status<600?83:0==e.status&&4==e.readyState?84:85:80,
onError({
err_msg:N,
code:t
});
}
}):e();
},
onShowMenu:function(e,i){
t._trigger("showMenu",i);
}
}),this._pvReport(),this._trigger("playerReady"),o.__count__=0,o.__hasReport=!1,
"string"==typeof o.container&&"#"==o.container.charAt(0)&&document.getElementById(o.container.substr(1)).getElementsByClassName("js_video_play_controll")[0].addEventListener("click",function(){
o.__count__++;
});
},o.prototype.getReportTypeBySceneType=function(){
return 0==this._o.scene_type?1:1==this._o.scene_type||2==this._o.scene_type?2:4==this._o.scene_type?3:7==this._o.scene_type?4:0;
},o.prototype._getFromid=function(){
return this._o.fromid;
},o.prototype._bindResize=function(){
var e=this;
U.on(window,"resize",function(){
return e._g.myPlayer&&e._g.myPlayer._useWcSlPlayer()?void(e._g.myPlayer.isInFullScreen()||setTimeout(function(){
var t=$(e._o.container),i=t.offset().width;
0!=i&&e.setVideoCSS({
width:i+"px"
});
},0)):void(e._o.height&&e._o.width&&(e._g.isShowTx&&e._g.txPlayer?setTimeout(function(){
try{
var t=$(e._o.container),i=e._o.width/e._o.height,o=t.offset().width,r=Math.floor(o/i);
0!=o&&(e._g.gWidth=o,e._g.gHeight=r,t.css({
height:r+"px"
}),e._g.txPlayer.resize({
width:o,
height:r
}));
}catch(a){}
},0):setTimeout(function(){
var t=$(e._o.container),i=e._o.width/e._o.height,o=t.offset().width,r=Math.floor(o/i);
0!=o&&(e._g.gWidth=o,e._g.gHeight=r,e.setVideoCSS({
width:o+"px",
height:r+"px"
}),t.css({
height:r+"px"
}));
},0)));
},!1);
},o.prototype._setBlockPlugin=function(e,t){
this._blockPlugin[e]=t;
},o.prototype._trigger=function(e){
var t=void 0,i=void 0,o=this.plugins,r=this._blockPlugin[e]||this._blockPlugin.all,a=0;
if(r&&"function"==typeof r.recv&&(t=r.recv.apply(r,arguments),"[object Object]"==Object.prototype.toString.call(t)?(a|=t.code,
i=t.data):a|=t,1&a))return i;
for(var n=0,s=o.length;s>n&&(t=o[n].recv.apply(o[n],arguments),"[object Object]"==Object.prototype.toString.call(t)?(a|=t.code,
i=t.data):a|=t,!(2&a));++n);
if(!(this._blockInnerHandler||4&a)){
var d=this["__"+e+"Handler"];
d&&(t=d.apply(this,arguments),"[object Object]"==Object.prototype.toString.call(t)&&(i=t.data));
}
return 8&a||this.__triggerOutside.apply(this,arguments),i;
},o.prototype.__triggerOutside=function(){
var e=this._o,t=arguments,i=t[0];
if(i){
i=i.substr(0,1).toUpperCase()+i.substr(1);
var o=e["on"+i];
"function"==typeof o&&o.apply(this,t);
}
},o.prototype._getCover=function(){
var e=this._o;
return p(e.vid,e.ratio,e.is_mp_video);
},o.prototype._cacheData=function(){
var e=this._g.myPlayer,t=this._g.vInfo;
e&&(t.status||(t.status={}),"function"==typeof e.isEnd&&(t.status.isEnd=e.isEnd()),
"function"==typeof e.getCurTime&&(t.status.playTime=e.getCurTime()),"function"==typeof e.getPlaybackRate&&(t.status.playbackRate=e.getPlaybackRate()),
!this._g.initialData&&this._g.coverUrl&&(t.coverUrl=this._g.coverUrl),h(this._o.__biz,this._o.mid,this._o.idx,this._o.vid,this._g.vInfo,this._g.cacheStartTs));
},o.prototype._getCache=function(){
var e=g(this._o.__biz,this._o.mid,this._o.idx,this._o.vid);
if(e){
var t=this._g.vInfo;
t.dynamicData=e.videoInfo.dynamicData||null,t.coverUrl=e.videoInfo.coverUrl||"",
t.status=e.videoInfo.status||null,this._g.cacheStartTs=e.time||null;
}
},o.prototype._clearCache=function(){
f(this._o.vid);
},o.prototype._qqVideoReport=function(e){
var t={
step:e.step,
loadwait:e.loadwait||0,
val:e.val||0,
vid:this._o.vid
};
6==e.step&&(t.vt=this._report.vt),V.qqvideo_common_report(t);
},o.prototype._pvReport=function(){
this._qqVideoReport({
step:3
});
},o.prototype._showError=function(e,t){
t=t||1;
var i=this,o=this._report.videoerror,r=y(this._o.container.replace(/^#/,""));
if(r){
e=e||N;
var a=!1;
e===N&&(a=!0),r.innerHTML=q.tmpl(W,{
errType:t,
msg:e,
errcode:o,
showBtn:a,
width:r.offsetWidth,
height:r.offsetHeight,
is_mp_video:this._o.is_mp_video
},!1);
{
var n=$(r).find(".js_video_errormsg_btn");
$(r).find(".js_video_errormsg_loading"),$(r).find(".js_error_area");
}
U.tap(n[0],function(){
i._reInit();
});
}
},o.prototype._reInit=function(){
var e=y(this._o.container.replace(/^#/,""));
e.innerHTML="";
var t=!1,i=!1;
Q.isUseProxy&&this._report.videoerror>=41&&this._report.videoerror<=46&&(t=!0,this._g.noProxy&&(i=!0)),
this._init({
noProxy:t,
hasReportProxyError:i,
hasInitPlugins:!0,
gWidth:this._g.gWidth,
gHeight:this._g.gHeight
});
},o.prototype.__showEndContentHandler=function(){
this._debug("resetVideo"),this._g.myPlayer._useWcSlPlayer()?this._g.myPlayer.showCover():this._g.myPlayer.resetVideo(),
this._g.myPlayer.hidePlayBtn();
},o.prototype._debug=function(){},o.prototype.__ariaReplayHandler=function(){
this.__replayHandler();
},o.prototype.__replayHandler=function(){
this._g.is_report_pv=!1,this._qqVideoReport({
step:3
}),this._report.replay=1,this._g.myPlayer.replay();
},o.prototype._getTraceId=function(){
var e=this._g.myAdPlugin;
return e?e.getTraceId():0;
},o.prototype._getOrderid=function(){
var e=this._g.myAdPlugin;
return e?e.getOrderid():0;
},o.prototype._getOriStatus=function(){
return this._o.ori_status;
},o.prototype._getPlayerReportData=function(){
var e=this._report,t=this._g.myPlayer,i=this._g.myAdPlugin;
t&&(e.quick_play=t.hasDrag()?1:0,e.full_screen=t.hasFullScreen()?1:0,e.drag_times=t.getDrag().join(":|:"),
e.play_time=this.getRealPlayTime()),i&&(e.ad_play_time=i.getAdPlaytime(),e.traceid=i.getTraceId(),
e.orderid=i.getOrderid()),e.webviewid=B.getWebviewid();
},o.prototype._cacheReportData=function(){
var e=this;
this._g.reportDataTimeoutId&&(clearTimeout(this._g.reportDataTimeoutId),this._g.reportDataTimeoutId=null),
!Q.videoDataLs||this._g.hasReport||this._g.hasDestroy||(this._getPlayerReportData(),
Q.videoDataLs.set(this._g.reportDataLsKey,this._report,+new Date+Q.videoDataLsExpTime)),
Q.neeedTimoutSaveReportData&&!this._g.hasDestroy&&(this._g.reportDataTimeoutId=window.setTimeout(function(){
e._cacheReportData();
},1e3));
},o.prototype.getVid=function(){
return this._o.vid;
},o.prototype.pause=function(){
this._g.myPlayer&&this._g.myPlayer.pause4outer();
},o.prototype.play=function(e){
this._g.myPlayer&&this._g.myPlayer.play4outer(e);
},o.prototype.firstPlay=function(){
this._g.myPlayer&&this._g.myPlayer.firstPlay();
},o.prototype.resetVideo=function(){
this._g.myPlayer&&this._g.myPlayer.resetVideo();
},o.prototype.getRealPlayTime=function(){
var e=0;
return this._g.myPlayer&&(e=Math.round(1e3*this._g.myPlayer.getPlayTotalTime())),
e;
},o.prototype.getCurrentTime=function(){
var e=0,t=this._g.myPlayer;
return this._g.myPlayer&&(e=t.getCurTime()),e;
},o.prototype.getVideoData=function(){
return this._g.vInfo&&this._g.vInfo.dynamicData&&this._g.vInfo.dynamicData.data?this._g.vInfo.dynamicData.data:null;
},o.prototype.getReportData=function(){
return this._report;
},o.prototype.mpVideoReport=function(e){
if(e=e||{},!this._g.hasReport&&!this._g.hasDestroy){
this._g.hasReport=!0;
var t=this._report;
0===t.videoerror?this.cacheData():this.clearCache(),Q.videoDataLs&&Q.videoDataLs.remove(this._g.reportDataLsKey),
this._getPlayerReportData(),Q._debug&&console.log("report video data:"+JSON.stringify(t)),
V.videoreport({
data:t,
async:e.async
});
}
},o.prototype.extendMpReportData=function(e){
w(this._report,e);
},o.prototype.getMpReportData=function(){
return this._report;
},o.prototype.clearCache=function(){
this._clearCache();
},o.prototype.cacheData=function(){
this._cacheData();
},o.prototype._cacheOnPageInvisible=function(){
var e=this;
document.addEventListener("visibilitychange",function(){
document.hidden&&e.cacheData();
});
},o.prototype._leaveReport12710=function(){
var e=this,t={
type:this._o.leaveReport12710Type,
step:17,
useruin:this._o.uin,
bizuin:this._o.__biz,
mid:this._o.mid,
idx:this._o.idx,
vid:this._o.vid
};
G.addReport(function(){
var i=e.getRealPlayTime();
if(!i)return!1;
var o=e.getVideoData();
return t.duration=Math.round(1e3*o.time),t.clienttime=Date.now(),t.real_play_time=i,
{
reportUrl:"https://mp.weixin.qq.com/mp/ad_video_report?action=video_play_exit_report",
reportData:Object.keys(t).map(function(e){
return e+"="+encodeURIComponent(t[e]||"");
}).join("&"),
method:"POST"
};
});
},o.prototype.setWidth=function(e){
this._g.myPlayer.setWidth(e);
},o.prototype.setHeight=function(e){
this._g.myPlayer.setHeight(e);
},o.prototype.renderLike=function(){
var e=this._g.myPlayer;
e&&e.isEnd()&&this._trigger("showEndContent");
},o.prototype.setVideoCSS=function(e){
var t=this,i=this._g.myPlayer,o=this._g.myAdPlugin;
i&&(i.setVideoCSS(e),o&&o.setSize(e),setTimeout(function(){
t.renderLike();
},0));
var r=$(this._o.container).find(".js_error_box");
r&&r.length>0&&r.css(e);
},o.prototype.destroy=function(){
for(var e=0;e<Q.videoInstance.length;e++)Q.videoInstance[e]===this&&(Q.videoInstance.splice(e,1),
e--);
this._g&&(this._g.event&&T.removeListener({
type:"afterRemoveLoading",
func:this._g.event.afterRemoveLoading
}),this._g.myPlayer&&this._g.myPlayer.destroy(),this._g.hasDestroy=!0);
},o.prototype.supportWcSlPlayer=function(){
return!!this._g.myPlayer&&this._g.myPlayer.supportWcSlPlayer();
};
var Y=-1!=navigator.userAgent.indexOf("MicroMessenger")&&(I.isIOS||I.isAndroid||I.isWp);
return{
getHashByVid:c,
mpVideoPlayer:o,
getFormatTime:A._getFormatTime,
getCoverByVid:p,
getQQVideoStaticInfo:_
};
});