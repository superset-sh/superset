"use strict";var __supersetAnnotationBundle=(()=>{var T5=Object.create;var Id=Object.defineProperty;var A5=Object.getOwnPropertyDescriptor;var k5=Object.getOwnPropertyNames;var M5=Object.getPrototypeOf,z5=Object.prototype.hasOwnProperty;var We=(t,e)=>()=>(e||t((e={exports:{}}).exports,e),e.exports);var L5=(t,e,n,l)=>{if(e&&typeof e=="object"||typeof e=="function")for(let a of k5(e))!z5.call(t,a)&&a!==n&&Id(t,a,{get:()=>e[a],enumerable:!(l=A5(e,a))||l.enumerable});return t};var Dn=(t,e,n)=>(n=t!=null?T5(M5(t)):{},L5(e||!t||!t.__esModule?Id(n,"default",{value:t,enumerable:!0}):n,t));var u_=We(K=>{"use strict";var gu=Symbol.for("react.transitional.element"),N5=Symbol.for("react.portal"),O5=Symbol.for("react.fragment"),D5=Symbol.for("react.strict_mode"),B5=Symbol.for("react.profiler"),Y5=Symbol.for("react.consumer"),H5=Symbol.for("react.context"),R5=Symbol.for("react.forward_ref"),U5=Symbol.for("react.suspense"),j5=Symbol.for("react.memo"),n_=Symbol.for("react.lazy"),X5=Symbol.for("react.activity"),Fd=Symbol.iterator;function Q5(t){return t===null||typeof t!="object"?null:(t=Fd&&t[Fd]||t["@@iterator"],typeof t=="function"?t:null)}var l_={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},a_=Object.assign,o_={};function Gl(t,e,n){this.props=t,this.context=e,this.refs=o_,this.updater=n||l_}Gl.prototype.isReactComponent={};Gl.prototype.setState=function(t,e){if(typeof t!="object"&&typeof t!="function"&&t!=null)throw Error("takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,t,e,"setState")};Gl.prototype.forceUpdate=function(t){this.updater.enqueueForceUpdate(this,t,"forceUpdate")};function i_(){}i_.prototype=Gl.prototype;function pu(t,e,n){this.props=t,this.context=e,this.refs=o_,this.updater=n||l_}var bu=pu.prototype=new i_;bu.constructor=pu;a_(bu,Gl.prototype);bu.isPureReactComponent=!0;var Pd=Array.isArray;function yu(){}var bt={H:null,A:null,T:null,S:null},s_=Object.prototype.hasOwnProperty;function vu(t,e,n){var l=n.ref;return{$$typeof:gu,type:t,key:e,ref:l!==void 0?l:null,props:n}}function q5(t,e){return vu(t.type,e,t.props)}function xu(t){return typeof t=="object"&&t!==null&&t.$$typeof===gu}function Z5(t){var e={"=":"=0",":":"=2"};return"$"+t.replace(/[=:]/g,function(n){return e[n]})}var t_=/\/+/g;function hu(t,e){return typeof t=="object"&&t!==null&&t.key!=null?Z5(""+t.key):e.toString(36)}function G5(t){switch(t.status){case"fulfilled":return t.value;case"rejected":throw t.reason;default:switch(typeof t.status=="string"?t.then(yu,yu):(t.status="pending",t.then(function(e){t.status==="pending"&&(t.status="fulfilled",t.value=e)},function(e){t.status==="pending"&&(t.status="rejected",t.reason=e)})),t.status){case"fulfilled":return t.value;case"rejected":throw t.reason}}throw t}function Zl(t,e,n,l,a){var o=typeof t;(o==="undefined"||o==="boolean")&&(t=null);var i=!1;if(t===null)i=!0;else switch(o){case"bigint":case"string":case"number":i=!0;break;case"object":switch(t.$$typeof){case gu:case N5:i=!0;break;case n_:return i=t._init,Zl(i(t._payload),e,n,l,a)}}if(i)return a=a(t),i=l===""?"."+hu(t,0):l,Pd(a)?(n="",i!=null&&(n=i.replace(t_,"$&/")+"/"),Zl(a,e,n,"",function(m){return m})):a!=null&&(xu(a)&&(a=q5(a,n+(a.key==null||t&&t.key===a.key?"":(""+a.key).replace(t_,"$&/")+"/")+i)),e.push(a)),1;i=0;var s=l===""?".":l+":";if(Pd(t))for(var u=0;u<t.length;u++)l=t[u],o=s+hu(l,u),i+=Zl(l,e,n,o,a);else if(u=Q5(t),typeof u=="function")for(t=u.call(t),u=0;!(l=t.next()).done;)l=l.value,o=s+hu(l,u++),i+=Zl(l,e,n,o,a);else if(o==="object"){if(typeof t.then=="function")return Zl(G5(t),e,n,l,a);throw e=String(t),Error("Objects are not valid as a React child (found: "+(e==="[object Object]"?"object with keys {"+Object.keys(t).join(", ")+"}":e)+"). If you meant to render a collection of children, use an array instead.")}return i}function hi(t,e,n){if(t==null)return t;var l=[],a=0;return Zl(t,l,"","",function(o){return e.call(n,o,a++)}),l}function $5(t){if(t._status===-1){var e=t._result;e=e(),e.then(function(n){(t._status===0||t._status===-1)&&(t._status=1,t._result=n)},function(n){(t._status===0||t._status===-1)&&(t._status=2,t._result=n)}),t._status===-1&&(t._status=0,t._result=e)}if(t._status===1)return t._result.default;throw t._result}var e_=typeof reportError=="function"?reportError:function(t){if(typeof window=="object"&&typeof window.ErrorEvent=="function"){var e=new window.ErrorEvent("error",{bubbles:!0,cancelable:!0,message:typeof t=="object"&&t!==null&&typeof t.message=="string"?String(t.message):String(t),error:t});if(!window.dispatchEvent(e))return}else if(typeof process=="object"&&typeof process.emit=="function"){process.emit("uncaughtException",t);return}console.error(t)},V5={map:hi,forEach:function(t,e,n){hi(t,function(){e.apply(this,arguments)},n)},count:function(t){var e=0;return hi(t,function(){e++}),e},toArray:function(t){return hi(t,function(e){return e})||[]},only:function(t){if(!xu(t))throw Error("React.Children.only expected to receive a single React element child.");return t}};K.Activity=X5;K.Children=V5;K.Component=Gl;K.Fragment=O5;K.Profiler=B5;K.PureComponent=pu;K.StrictMode=D5;K.Suspense=U5;K.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=bt;K.__COMPILER_RUNTIME={__proto__:null,c:function(t){return bt.H.useMemoCache(t)}};K.cache=function(t){return function(){return t.apply(null,arguments)}};K.cacheSignal=function(){return null};K.cloneElement=function(t,e,n){if(t==null)throw Error("The argument must be a React element, but you passed "+t+".");var l=a_({},t.props),a=t.key;if(e!=null)for(o in e.key!==void 0&&(a=""+e.key),e)!s_.call(e,o)||o==="key"||o==="__self"||o==="__source"||o==="ref"&&e.ref===void 0||(l[o]=e[o]);var o=arguments.length-2;if(o===1)l.children=n;else if(1<o){for(var i=Array(o),s=0;s<o;s++)i[s]=arguments[s+2];l.children=i}return vu(t.type,a,l)};K.createContext=function(t){return t={$$typeof:H5,_currentValue:t,_currentValue2:t,_threadCount:0,Provider:null,Consumer:null},t.Provider=t,t.Consumer={$$typeof:Y5,_context:t},t};K.createElement=function(t,e,n){var l,a={},o=null;if(e!=null)for(l in e.key!==void 0&&(o=""+e.key),e)s_.call(e,l)&&l!=="key"&&l!=="__self"&&l!=="__source"&&(a[l]=e[l]);var i=arguments.length-2;if(i===1)a.children=n;else if(1<i){for(var s=Array(i),u=0;u<i;u++)s[u]=arguments[u+2];a.children=s}if(t&&t.defaultProps)for(l in i=t.defaultProps,i)a[l]===void 0&&(a[l]=i[l]);return vu(t,o,a)};K.createRef=function(){return{current:null}};K.forwardRef=function(t){return{$$typeof:R5,render:t}};K.isValidElement=xu;K.lazy=function(t){return{$$typeof:n_,_payload:{_status:-1,_result:t},_init:$5}};K.memo=function(t,e){return{$$typeof:j5,type:t,compare:e===void 0?null:e}};K.startTransition=function(t){var e=bt.T,n={};bt.T=n;try{var l=t(),a=bt.S;a!==null&&a(n,l),typeof l=="object"&&l!==null&&typeof l.then=="function"&&l.then(yu,e_)}catch(o){e_(o)}finally{e!==null&&n.types!==null&&(e.types=n.types),bt.T=e}};K.unstable_useCacheRefresh=function(){return bt.H.useCacheRefresh()};K.use=function(t){return bt.H.use(t)};K.useActionState=function(t,e,n){return bt.H.useActionState(t,e,n)};K.useCallback=function(t,e){return bt.H.useCallback(t,e)};K.useContext=function(t){return bt.H.useContext(t)};K.useDebugValue=function(){};K.useDeferredValue=function(t,e){return bt.H.useDeferredValue(t,e)};K.useEffect=function(t,e){return bt.H.useEffect(t,e)};K.useEffectEvent=function(t){return bt.H.useEffectEvent(t)};K.useId=function(){return bt.H.useId()};K.useImperativeHandle=function(t,e,n){return bt.H.useImperativeHandle(t,e,n)};K.useInsertionEffect=function(t,e){return bt.H.useInsertionEffect(t,e)};K.useLayoutEffect=function(t,e){return bt.H.useLayoutEffect(t,e)};K.useMemo=function(t,e){return bt.H.useMemo(t,e)};K.useOptimistic=function(t,e){return bt.H.useOptimistic(t,e)};K.useReducer=function(t,e,n){return bt.H.useReducer(t,e,n)};K.useRef=function(t){return bt.H.useRef(t)};K.useState=function(t){return bt.H.useState(t)};K.useSyncExternalStore=function(t,e,n){return bt.H.useSyncExternalStore(t,e,n)};K.useTransition=function(){return bt.H.useTransition()};K.version="19.2.0"});var $l=We((Mg,c_)=>{"use strict";c_.exports=u_()});var d_=We(ee=>{"use strict";var K5=$l();function r_(t){var e="https://react.dev/errors/"+t;if(1<arguments.length){e+="?args[]="+encodeURIComponent(arguments[1]);for(var n=2;n<arguments.length;n++)e+="&args[]="+encodeURIComponent(arguments[n])}return"Minified React error #"+t+"; visit "+e+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}function Bn(){}var te={d:{f:Bn,r:function(){throw Error(r_(522))},D:Bn,C:Bn,L:Bn,m:Bn,X:Bn,S:Bn,M:Bn},p:0,findDOMNode:null},J5=Symbol.for("react.portal");function W5(t,e,n){var l=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:J5,key:l==null?null:""+l,children:t,containerInfo:e,implementation:n}}var Wa=K5.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;function yi(t,e){if(t==="font")return"";if(typeof e=="string")return e==="use-credentials"?e:""}ee.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=te;ee.createPortal=function(t,e){var n=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)throw Error(r_(299));return W5(t,e,null,n)};ee.flushSync=function(t){var e=Wa.T,n=te.p;try{if(Wa.T=null,te.p=2,t)return t()}finally{Wa.T=e,te.p=n,te.d.f()}};ee.preconnect=function(t,e){typeof t=="string"&&(e?(e=e.crossOrigin,e=typeof e=="string"?e==="use-credentials"?e:"":void 0):e=null,te.d.C(t,e))};ee.prefetchDNS=function(t){typeof t=="string"&&te.d.D(t)};ee.preinit=function(t,e){if(typeof t=="string"&&e&&typeof e.as=="string"){var n=e.as,l=yi(n,e.crossOrigin),a=typeof e.integrity=="string"?e.integrity:void 0,o=typeof e.fetchPriority=="string"?e.fetchPriority:void 0;n==="style"?te.d.S(t,typeof e.precedence=="string"?e.precedence:void 0,{crossOrigin:l,integrity:a,fetchPriority:o}):n==="script"&&te.d.X(t,{crossOrigin:l,integrity:a,fetchPriority:o,nonce:typeof e.nonce=="string"?e.nonce:void 0})}};ee.preinitModule=function(t,e){if(typeof t=="string")if(typeof e=="object"&&e!==null){if(e.as==null||e.as==="script"){var n=yi(e.as,e.crossOrigin);te.d.M(t,{crossOrigin:n,integrity:typeof e.integrity=="string"?e.integrity:void 0,nonce:typeof e.nonce=="string"?e.nonce:void 0})}}else e==null&&te.d.M(t)};ee.preload=function(t,e){if(typeof t=="string"&&typeof e=="object"&&e!==null&&typeof e.as=="string"){var n=e.as,l=yi(n,e.crossOrigin);te.d.L(t,n,{crossOrigin:l,integrity:typeof e.integrity=="string"?e.integrity:void 0,nonce:typeof e.nonce=="string"?e.nonce:void 0,type:typeof e.type=="string"?e.type:void 0,fetchPriority:typeof e.fetchPriority=="string"?e.fetchPriority:void 0,referrerPolicy:typeof e.referrerPolicy=="string"?e.referrerPolicy:void 0,imageSrcSet:typeof e.imageSrcSet=="string"?e.imageSrcSet:void 0,imageSizes:typeof e.imageSizes=="string"?e.imageSizes:void 0,media:typeof e.media=="string"?e.media:void 0})}};ee.preloadModule=function(t,e){if(typeof t=="string")if(e){var n=yi(e.as,e.crossOrigin);te.d.m(t,{as:typeof e.as=="string"&&e.as!=="script"?e.as:void 0,crossOrigin:n,integrity:typeof e.integrity=="string"?e.integrity:void 0})}else te.d.m(t)};ee.requestFormReset=function(t){te.d.r(t)};ee.unstable_batchedUpdates=function(t,e){return t(e)};ee.useFormState=function(t,e,n){return Wa.H.useFormState(t,e,n)};ee.useFormStatus=function(){return Wa.H.useHostTransitionStatus()};ee.version="19.2.0"});var Cu=We((Lg,f_)=>{"use strict";function __(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(__)}catch(t){console.error(t)}}__(),f_.exports=d_()});var h_=We(gi=>{"use strict";var I5=Symbol.for("react.transitional.element"),F5=Symbol.for("react.fragment");function m_(t,e,n){var l=null;if(n!==void 0&&(l=""+n),e.key!==void 0&&(l=""+e.key),"key"in e){n={};for(var a in e)a!=="key"&&(n[a]=e[a])}else n=e;return e=n.ref,{$$typeof:I5,type:t,key:l,ref:e!==void 0?e:null,props:n}}gi.Fragment=F5;gi.jsx=m_;gi.jsxs=m_});var pi=We((Og,y_)=>{"use strict";y_.exports=h_()});var Q_=We(wt=>{"use strict";function Uu(t,e){var n=t.length;t.push(e);t:for(;0<n;){var l=n-1>>>1,a=t[l];if(0<Ai(a,e))t[l]=e,t[n]=a,n=l;else break t}}function Fe(t){return t.length===0?null:t[0]}function Mi(t){if(t.length===0)return null;var e=t[0],n=t.pop();if(n!==e){t[0]=n;t:for(var l=0,a=t.length,o=a>>>1;l<o;){var i=2*(l+1)-1,s=t[i],u=i+1,m=t[u];if(0>Ai(s,n))u<a&&0>Ai(m,s)?(t[l]=m,t[u]=n,l=u):(t[l]=s,t[i]=n,l=i);else if(u<a&&0>Ai(m,n))t[l]=m,t[u]=n,l=u;else break t}}return e}function Ai(t,e){var n=t.sortIndex-e.sortIndex;return n!==0?n:t.id-e.id}wt.unstable_now=void 0;typeof performance=="object"&&typeof performance.now=="function"?(O_=performance,wt.unstable_now=function(){return O_.now()}):(Yu=Date,D_=Yu.now(),wt.unstable_now=function(){return Yu.now()-D_});var O_,Yu,D_,_n=[],Yn=[],K2=1,Le=null,Ft=3,ju=!1,lo=!1,ao=!1,Xu=!1,H_=typeof setTimeout=="function"?setTimeout:null,R_=typeof clearTimeout=="function"?clearTimeout:null,B_=typeof setImmediate<"u"?setImmediate:null;function ki(t){for(var e=Fe(Yn);e!==null;){if(e.callback===null)Mi(Yn);else if(e.startTime<=t)Mi(Yn),e.sortIndex=e.expirationTime,Uu(_n,e);else break;e=Fe(Yn)}}function Qu(t){if(ao=!1,ki(t),!lo)if(Fe(_n)!==null)lo=!0,Il||(Il=!0,Wl());else{var e=Fe(Yn);e!==null&&qu(Qu,e.startTime-t)}}var Il=!1,oo=-1,U_=5,j_=-1;function X_(){return Xu?!0:!(wt.unstable_now()-j_<U_)}function Hu(){if(Xu=!1,Il){var t=wt.unstable_now();j_=t;var e=!0;try{t:{lo=!1,ao&&(ao=!1,R_(oo),oo=-1),ju=!0;var n=Ft;try{e:{for(ki(t),Le=Fe(_n);Le!==null&&!(Le.expirationTime>t&&X_());){var l=Le.callback;if(typeof l=="function"){Le.callback=null,Ft=Le.priorityLevel;var a=l(Le.expirationTime<=t);if(t=wt.unstable_now(),typeof a=="function"){Le.callback=a,ki(t),e=!0;break e}Le===Fe(_n)&&Mi(_n),ki(t)}else Mi(_n);Le=Fe(_n)}if(Le!==null)e=!0;else{var o=Fe(Yn);o!==null&&qu(Qu,o.startTime-t),e=!1}}break t}finally{Le=null,Ft=n,ju=!1}e=void 0}}finally{e?Wl():Il=!1}}}var Wl;typeof B_=="function"?Wl=function(){B_(Hu)}:typeof MessageChannel<"u"?(Ru=new MessageChannel,Y_=Ru.port2,Ru.port1.onmessage=Hu,Wl=function(){Y_.postMessage(null)}):Wl=function(){H_(Hu,0)};var Ru,Y_;function qu(t,e){oo=H_(function(){t(wt.unstable_now())},e)}wt.unstable_IdlePriority=5;wt.unstable_ImmediatePriority=1;wt.unstable_LowPriority=4;wt.unstable_NormalPriority=3;wt.unstable_Profiling=null;wt.unstable_UserBlockingPriority=2;wt.unstable_cancelCallback=function(t){t.callback=null};wt.unstable_forceFrameRate=function(t){0>t||125<t?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):U_=0<t?Math.floor(1e3/t):5};wt.unstable_getCurrentPriorityLevel=function(){return Ft};wt.unstable_next=function(t){switch(Ft){case 1:case 2:case 3:var e=3;break;default:e=Ft}var n=Ft;Ft=e;try{return t()}finally{Ft=n}};wt.unstable_requestPaint=function(){Xu=!0};wt.unstable_runWithPriority=function(t,e){switch(t){case 1:case 2:case 3:case 4:case 5:break;default:t=3}var n=Ft;Ft=t;try{return e()}finally{Ft=n}};wt.unstable_scheduleCallback=function(t,e,n){var l=wt.unstable_now();switch(typeof n=="object"&&n!==null?(n=n.delay,n=typeof n=="number"&&0<n?l+n:l):n=l,t){case 1:var a=-1;break;case 2:a=250;break;case 5:a=1073741823;break;case 4:a=1e4;break;default:a=5e3}return a=n+a,t={id:K2++,callback:e,priorityLevel:t,startTime:n,expirationTime:a,sortIndex:-1},n>l?(t.sortIndex=n,Uu(Yn,t),Fe(_n)===null&&t===Fe(Yn)&&(ao?(R_(oo),oo=-1):ao=!0,qu(Qu,n-l))):(t.sortIndex=a,Uu(_n,t),lo||ju||(lo=!0,Il||(Il=!0,Wl()))),t};wt.unstable_shouldYield=X_;wt.unstable_wrapCallback=function(t){var e=Ft;return function(){var n=Ft;Ft=e;try{return t.apply(this,arguments)}finally{Ft=n}}}});var Z_=We((Yg,q_)=>{"use strict";q_.exports=Q_()});var l5=We(tu=>{"use strict";var Qt=Z_(),g1=$l(),J2=Cu();function w(t){var e="https://react.dev/errors/"+t;if(1<arguments.length){e+="?args[]="+encodeURIComponent(arguments[1]);for(var n=2;n<arguments.length;n++)e+="&args[]="+encodeURIComponent(arguments[n])}return"Minified React error #"+t+"; visit "+e+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}function p1(t){return!(!t||t.nodeType!==1&&t.nodeType!==9&&t.nodeType!==11)}function $o(t){var e=t,n=t;if(t.alternate)for(;e.return;)e=e.return;else{t=e;do e=t,e.flags&4098&&(n=e.return),t=e.return;while(t)}return e.tag===3?n:null}function b1(t){if(t.tag===13){var e=t.memoizedState;if(e===null&&(t=t.alternate,t!==null&&(e=t.memoizedState)),e!==null)return e.dehydrated}return null}function v1(t){if(t.tag===31){var e=t.memoizedState;if(e===null&&(t=t.alternate,t!==null&&(e=t.memoizedState)),e!==null)return e.dehydrated}return null}function G_(t){if($o(t)!==t)throw Error(w(188))}function W2(t){var e=t.alternate;if(!e){if(e=$o(t),e===null)throw Error(w(188));return e!==t?null:t}for(var n=t,l=e;;){var a=n.return;if(a===null)break;var o=a.alternate;if(o===null){if(l=a.return,l!==null){n=l;continue}break}if(a.child===o.child){for(o=a.child;o;){if(o===n)return G_(a),t;if(o===l)return G_(a),e;o=o.sibling}throw Error(w(188))}if(n.return!==l.return)n=a,l=o;else{for(var i=!1,s=a.child;s;){if(s===n){i=!0,n=a,l=o;break}if(s===l){i=!0,l=a,n=o;break}s=s.sibling}if(!i){for(s=o.child;s;){if(s===n){i=!0,n=o,l=a;break}if(s===l){i=!0,l=o,n=a;break}s=s.sibling}if(!i)throw Error(w(189))}}if(n.alternate!==l)throw Error(w(190))}if(n.tag!==3)throw Error(w(188));return n.stateNode.current===n?t:e}function x1(t){var e=t.tag;if(e===5||e===26||e===27||e===6)return t;for(t=t.child;t!==null;){if(e=x1(t),e!==null)return e;t=t.sibling}return null}var Ct=Object.assign,I2=Symbol.for("react.element"),zi=Symbol.for("react.transitional.element"),mo=Symbol.for("react.portal"),la=Symbol.for("react.fragment"),C1=Symbol.for("react.strict_mode"),Sc=Symbol.for("react.profiler"),S1=Symbol.for("react.consumer"),vn=Symbol.for("react.context"),pr=Symbol.for("react.forward_ref"),wc=Symbol.for("react.suspense"),Ec=Symbol.for("react.suspense_list"),br=Symbol.for("react.memo"),Hn=Symbol.for("react.lazy");Symbol.for("react.scope");var Tc=Symbol.for("react.activity");Symbol.for("react.legacy_hidden");Symbol.for("react.tracing_marker");var F2=Symbol.for("react.memo_cache_sentinel");Symbol.for("react.view_transition");var $_=Symbol.iterator;function io(t){return t===null||typeof t!="object"?null:(t=$_&&t[$_]||t["@@iterator"],typeof t=="function"?t:null)}var P2=Symbol.for("react.client.reference");function Ac(t){if(t==null)return null;if(typeof t=="function")return t.$$typeof===P2?null:t.displayName||t.name||null;if(typeof t=="string")return t;switch(t){case la:return"Fragment";case Sc:return"Profiler";case C1:return"StrictMode";case wc:return"Suspense";case Ec:return"SuspenseList";case Tc:return"Activity"}if(typeof t=="object")switch(t.$$typeof){case mo:return"Portal";case vn:return t.displayName||"Context";case S1:return(t._context.displayName||"Context")+".Consumer";case pr:var e=t.render;return t=t.displayName,t||(t=e.displayName||e.name||"",t=t!==""?"ForwardRef("+t+")":"ForwardRef"),t;case br:return e=t.displayName||null,e!==null?e:Ac(t.type)||"Memo";case Hn:e=t._payload,t=t._init;try{return Ac(t(e))}catch{}}return null}var ho=Array.isArray,Q=g1.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,rt=J2.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,vl={pending:!1,data:null,method:null,action:null},kc=[],aa=-1;function ln(t){return{current:t}}function $t(t){0>aa||(t.current=kc[aa],kc[aa]=null,aa--)}function pt(t,e){aa++,kc[aa]=t.current,t.current=e}var nn=ln(null),No=ln(null),Kn=ln(null),cs=ln(null);function rs(t,e){switch(pt(Kn,e),pt(No,t),pt(nn,null),e.nodeType){case 9:case 11:t=(t=e.documentElement)&&(t=t.namespaceURI)?t1(t):0;break;default:if(t=e.tagName,e=e.namespaceURI)e=t1(e),t=qm(e,t);else switch(t){case"svg":t=1;break;case"math":t=2;break;default:t=0}}$t(nn),pt(nn,t)}function Ca(){$t(nn),$t(No),$t(Kn)}function Mc(t){t.memoizedState!==null&&pt(cs,t);var e=nn.current,n=qm(e,t.type);e!==n&&(pt(No,t),pt(nn,n))}function ds(t){No.current===t&&($t(nn),$t(No)),cs.current===t&&($t(cs),qo._currentValue=vl)}var Zu,V_;function yl(t){if(Zu===void 0)try{throw Error()}catch(n){var e=n.stack.trim().match(/\n( *(at )?)/);Zu=e&&e[1]||"",V_=-1<n.stack.indexOf(`
    at`)?" (<anonymous>)":-1<n.stack.indexOf("@")?"@unknown:0:0":""}return`
`+Zu+t+V_}var Gu=!1;function $u(t,e){if(!t||Gu)return"";Gu=!0;var n=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{var l={DetermineComponentFrameRoot:function(){try{if(e){var v=function(){throw Error()};if(Object.defineProperty(v.prototype,"props",{set:function(){throw Error()}}),typeof Reflect=="object"&&Reflect.construct){try{Reflect.construct(v,[])}catch(b){var g=b}Reflect.construct(t,[],v)}else{try{v.call()}catch(b){g=b}t.call(v.prototype)}}else{try{throw Error()}catch(b){g=b}(v=t())&&typeof v.catch=="function"&&v.catch(function(){})}}catch(b){if(b&&g&&typeof b.stack=="string")return[b.stack,g.stack]}return[null,null]}};l.DetermineComponentFrameRoot.displayName="DetermineComponentFrameRoot";var a=Object.getOwnPropertyDescriptor(l.DetermineComponentFrameRoot,"name");a&&a.configurable&&Object.defineProperty(l.DetermineComponentFrameRoot,"name",{value:"DetermineComponentFrameRoot"});var o=l.DetermineComponentFrameRoot(),i=o[0],s=o[1];if(i&&s){var u=i.split(`
`),m=s.split(`
`);for(a=l=0;l<u.length&&!u[l].includes("DetermineComponentFrameRoot");)l++;for(;a<m.length&&!m[a].includes("DetermineComponentFrameRoot");)a++;if(l===u.length||a===m.length)for(l=u.length-1,a=m.length-1;1<=l&&0<=a&&u[l]!==m[a];)a--;for(;1<=l&&0<=a;l--,a--)if(u[l]!==m[a]){if(l!==1||a!==1)do if(l--,a--,0>a||u[l]!==m[a]){var h=`
`+u[l].replace(" at new "," at ");return t.displayName&&h.includes("<anonymous>")&&(h=h.replace("<anonymous>",t.displayName)),h}while(1<=l&&0<=a);break}}}finally{Gu=!1,Error.prepareStackTrace=n}return(n=t?t.displayName||t.name:"")?yl(n):""}function th(t,e){switch(t.tag){case 26:case 27:case 5:return yl(t.type);case 16:return yl("Lazy");case 13:return t.child!==e&&e!==null?yl("Suspense Fallback"):yl("Suspense");case 19:return yl("SuspenseList");case 0:case 15:return $u(t.type,!1);case 11:return $u(t.type.render,!1);case 1:return $u(t.type,!0);case 31:return yl("Activity");default:return""}}function K_(t){try{var e="",n=null;do e+=th(t,n),n=t,t=t.return;while(t);return e}catch(l){return`
Error generating stack: `+l.message+`
`+l.stack}}var zc=Object.prototype.hasOwnProperty,vr=Qt.unstable_scheduleCallback,Vu=Qt.unstable_cancelCallback,eh=Qt.unstable_shouldYield,nh=Qt.unstable_requestPaint,Ce=Qt.unstable_now,lh=Qt.unstable_getCurrentPriorityLevel,w1=Qt.unstable_ImmediatePriority,E1=Qt.unstable_UserBlockingPriority,_s=Qt.unstable_NormalPriority,ah=Qt.unstable_LowPriority,T1=Qt.unstable_IdlePriority,oh=Qt.log,ih=Qt.unstable_setDisableYieldValue,Vo=null,Se=null;function qn(t){if(typeof oh=="function"&&ih(t),Se&&typeof Se.setStrictMode=="function")try{Se.setStrictMode(Vo,t)}catch{}}var we=Math.clz32?Math.clz32:ch,sh=Math.log,uh=Math.LN2;function ch(t){return t>>>=0,t===0?32:31-(sh(t)/uh|0)|0}var Li=256,Ni=262144,Oi=4194304;function gl(t){var e=t&42;if(e!==0)return e;switch(t&-t){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:return 64;case 128:return 128;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:return t&261888;case 262144:case 524288:case 1048576:case 2097152:return t&3932160;case 4194304:case 8388608:case 16777216:case 33554432:return t&62914560;case 67108864:return 67108864;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 0;default:return t}}function Rs(t,e,n){var l=t.pendingLanes;if(l===0)return 0;var a=0,o=t.suspendedLanes,i=t.pingedLanes;t=t.warmLanes;var s=l&134217727;return s!==0?(l=s&~o,l!==0?a=gl(l):(i&=s,i!==0?a=gl(i):n||(n=s&~t,n!==0&&(a=gl(n))))):(s=l&~o,s!==0?a=gl(s):i!==0?a=gl(i):n||(n=l&~t,n!==0&&(a=gl(n)))),a===0?0:e!==0&&e!==a&&!(e&o)&&(o=a&-a,n=e&-e,o>=n||o===32&&(n&4194048)!==0)?e:a}function Ko(t,e){return(t.pendingLanes&~(t.suspendedLanes&~t.pingedLanes)&e)===0}function rh(t,e){switch(t){case 1:case 2:case 4:case 8:case 64:return e+250;case 16:case 32:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return e+5e3;case 4194304:case 8388608:case 16777216:case 33554432:return-1;case 67108864:case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function A1(){var t=Oi;return Oi<<=1,!(Oi&62914560)&&(Oi=4194304),t}function Ku(t){for(var e=[],n=0;31>n;n++)e.push(t);return e}function Jo(t,e){t.pendingLanes|=e,e!==268435456&&(t.suspendedLanes=0,t.pingedLanes=0,t.warmLanes=0)}function dh(t,e,n,l,a,o){var i=t.pendingLanes;t.pendingLanes=n,t.suspendedLanes=0,t.pingedLanes=0,t.warmLanes=0,t.expiredLanes&=n,t.entangledLanes&=n,t.errorRecoveryDisabledLanes&=n,t.shellSuspendCounter=0;var s=t.entanglements,u=t.expirationTimes,m=t.hiddenUpdates;for(n=i&~n;0<n;){var h=31-we(n),v=1<<h;s[h]=0,u[h]=-1;var g=m[h];if(g!==null)for(m[h]=null,h=0;h<g.length;h++){var b=g[h];b!==null&&(b.lane&=-536870913)}n&=~v}l!==0&&k1(t,l,0),o!==0&&a===0&&t.tag!==0&&(t.suspendedLanes|=o&~(i&~e))}function k1(t,e,n){t.pendingLanes|=e,t.suspendedLanes&=~e;var l=31-we(e);t.entangledLanes|=e,t.entanglements[l]=t.entanglements[l]|1073741824|n&261930}function M1(t,e){var n=t.entangledLanes|=e;for(t=t.entanglements;n;){var l=31-we(n),a=1<<l;a&e|t[l]&e&&(t[l]|=e),n&=~a}}function z1(t,e){var n=e&-e;return n=n&42?1:xr(n),n&(t.suspendedLanes|e)?0:n}function xr(t){switch(t){case 2:t=1;break;case 8:t=4;break;case 32:t=16;break;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:t=128;break;case 268435456:t=134217728;break;default:t=0}return t}function Cr(t){return t&=-t,2<t?8<t?t&134217727?32:268435456:8:2}function L1(){var t=rt.p;return t!==0?t:(t=window.event,t===void 0?32:t5(t.type))}function J_(t,e){var n=rt.p;try{return rt.p=t,e()}finally{rt.p=n}}var sl=Math.random().toString(36).slice(2),Kt="__reactFiber$"+sl,_e="__reactProps$"+sl,Oa="__reactContainer$"+sl,Lc="__reactEvents$"+sl,_h="__reactListeners$"+sl,fh="__reactHandles$"+sl,W_="__reactResources$"+sl,Wo="__reactMarker$"+sl;function Sr(t){delete t[Kt],delete t[_e],delete t[Lc],delete t[_h],delete t[fh]}function oa(t){var e=t[Kt];if(e)return e;for(var n=t.parentNode;n;){if(e=n[Oa]||n[Kt]){if(n=e.alternate,e.child!==null||n!==null&&n.child!==null)for(t=o1(t);t!==null;){if(n=t[Kt])return n;t=o1(t)}return e}t=n,n=t.parentNode}return null}function Da(t){if(t=t[Kt]||t[Oa]){var e=t.tag;if(e===5||e===6||e===13||e===31||e===26||e===27||e===3)return t}return null}function yo(t){var e=t.tag;if(e===5||e===26||e===27||e===6)return t.stateNode;throw Error(w(33))}function ha(t){var e=t[W_];return e||(e=t[W_]={hoistableStyles:new Map,hoistableScripts:new Map}),e}function Gt(t){t[Wo]=!0}var N1=new Set,O1={};function zl(t,e){Sa(t,e),Sa(t+"Capture",e)}function Sa(t,e){for(O1[t]=e,t=0;t<e.length;t++)N1.add(e[t])}var mh=RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"),I_={},F_={};function hh(t){return zc.call(F_,t)?!0:zc.call(I_,t)?!1:mh.test(t)?F_[t]=!0:(I_[t]=!0,!1)}function Ki(t,e,n){if(hh(e))if(n===null)t.removeAttribute(e);else{switch(typeof n){case"undefined":case"function":case"symbol":t.removeAttribute(e);return;case"boolean":var l=e.toLowerCase().slice(0,5);if(l!=="data-"&&l!=="aria-"){t.removeAttribute(e);return}}t.setAttribute(e,""+n)}}function Di(t,e,n){if(n===null)t.removeAttribute(e);else{switch(typeof n){case"undefined":case"function":case"symbol":case"boolean":t.removeAttribute(e);return}t.setAttribute(e,""+n)}}function fn(t,e,n,l){if(l===null)t.removeAttribute(n);else{switch(typeof l){case"undefined":case"function":case"symbol":case"boolean":t.removeAttribute(n);return}t.setAttributeNS(e,n,""+l)}}function Oe(t){switch(typeof t){case"bigint":case"boolean":case"number":case"string":case"undefined":return t;case"object":return t;default:return""}}function D1(t){var e=t.type;return(t=t.nodeName)&&t.toLowerCase()==="input"&&(e==="checkbox"||e==="radio")}function yh(t,e,n){var l=Object.getOwnPropertyDescriptor(t.constructor.prototype,e);if(!t.hasOwnProperty(e)&&typeof l<"u"&&typeof l.get=="function"&&typeof l.set=="function"){var a=l.get,o=l.set;return Object.defineProperty(t,e,{configurable:!0,get:function(){return a.call(this)},set:function(i){n=""+i,o.call(this,i)}}),Object.defineProperty(t,e,{enumerable:l.enumerable}),{getValue:function(){return n},setValue:function(i){n=""+i},stopTracking:function(){t._valueTracker=null,delete t[e]}}}}function Nc(t){if(!t._valueTracker){var e=D1(t)?"checked":"value";t._valueTracker=yh(t,e,""+t[e])}}function B1(t){if(!t)return!1;var e=t._valueTracker;if(!e)return!0;var n=e.getValue(),l="";return t&&(l=D1(t)?t.checked?"true":"false":t.value),t=l,t!==n?(e.setValue(t),!0):!1}function fs(t){if(t=t||(typeof document<"u"?document:void 0),typeof t>"u")return null;try{return t.activeElement||t.body}catch{return t.body}}var gh=/[\n"\\]/g;function Ye(t){return t.replace(gh,function(e){return"\\"+e.charCodeAt(0).toString(16)+" "})}function Oc(t,e,n,l,a,o,i,s){t.name="",i!=null&&typeof i!="function"&&typeof i!="symbol"&&typeof i!="boolean"?t.type=i:t.removeAttribute("type"),e!=null?i==="number"?(e===0&&t.value===""||t.value!=e)&&(t.value=""+Oe(e)):t.value!==""+Oe(e)&&(t.value=""+Oe(e)):i!=="submit"&&i!=="reset"||t.removeAttribute("value"),e!=null?Dc(t,i,Oe(e)):n!=null?Dc(t,i,Oe(n)):l!=null&&t.removeAttribute("value"),a==null&&o!=null&&(t.defaultChecked=!!o),a!=null&&(t.checked=a&&typeof a!="function"&&typeof a!="symbol"),s!=null&&typeof s!="function"&&typeof s!="symbol"&&typeof s!="boolean"?t.name=""+Oe(s):t.removeAttribute("name")}function Y1(t,e,n,l,a,o,i,s){if(o!=null&&typeof o!="function"&&typeof o!="symbol"&&typeof o!="boolean"&&(t.type=o),e!=null||n!=null){if(!(o!=="submit"&&o!=="reset"||e!=null)){Nc(t);return}n=n!=null?""+Oe(n):"",e=e!=null?""+Oe(e):n,s||e===t.value||(t.value=e),t.defaultValue=e}l=l??a,l=typeof l!="function"&&typeof l!="symbol"&&!!l,t.checked=s?t.checked:!!l,t.defaultChecked=!!l,i!=null&&typeof i!="function"&&typeof i!="symbol"&&typeof i!="boolean"&&(t.name=i),Nc(t)}function Dc(t,e,n){e==="number"&&fs(t.ownerDocument)===t||t.defaultValue===""+n||(t.defaultValue=""+n)}function ya(t,e,n,l){if(t=t.options,e){e={};for(var a=0;a<n.length;a++)e["$"+n[a]]=!0;for(n=0;n<t.length;n++)a=e.hasOwnProperty("$"+t[n].value),t[n].selected!==a&&(t[n].selected=a),a&&l&&(t[n].defaultSelected=!0)}else{for(n=""+Oe(n),e=null,a=0;a<t.length;a++){if(t[a].value===n){t[a].selected=!0,l&&(t[a].defaultSelected=!0);return}e!==null||t[a].disabled||(e=t[a])}e!==null&&(e.selected=!0)}}function H1(t,e,n){if(e!=null&&(e=""+Oe(e),e!==t.value&&(t.value=e),n==null)){t.defaultValue!==e&&(t.defaultValue=e);return}t.defaultValue=n!=null?""+Oe(n):""}function R1(t,e,n,l){if(e==null){if(l!=null){if(n!=null)throw Error(w(92));if(ho(l)){if(1<l.length)throw Error(w(93));l=l[0]}n=l}n==null&&(n=""),e=n}n=Oe(e),t.defaultValue=n,l=t.textContent,l===n&&l!==""&&l!==null&&(t.value=l),Nc(t)}function wa(t,e){if(e){var n=t.firstChild;if(n&&n===t.lastChild&&n.nodeType===3){n.nodeValue=e;return}}t.textContent=e}var ph=new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));function P_(t,e,n){var l=e.indexOf("--")===0;n==null||typeof n=="boolean"||n===""?l?t.setProperty(e,""):e==="float"?t.cssFloat="":t[e]="":l?t.setProperty(e,n):typeof n!="number"||n===0||ph.has(e)?e==="float"?t.cssFloat=n:t[e]=(""+n).trim():t[e]=n+"px"}function U1(t,e,n){if(e!=null&&typeof e!="object")throw Error(w(62));if(t=t.style,n!=null){for(var l in n)!n.hasOwnProperty(l)||e!=null&&e.hasOwnProperty(l)||(l.indexOf("--")===0?t.setProperty(l,""):l==="float"?t.cssFloat="":t[l]="");for(var a in e)l=e[a],e.hasOwnProperty(a)&&n[a]!==l&&P_(t,a,l)}else for(var o in e)e.hasOwnProperty(o)&&P_(t,o,e[o])}function wr(t){if(t.indexOf("-")===-1)return!1;switch(t){case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return!1;default:return!0}}var bh=new Map([["acceptCharset","accept-charset"],["htmlFor","for"],["httpEquiv","http-equiv"],["crossOrigin","crossorigin"],["accentHeight","accent-height"],["alignmentBaseline","alignment-baseline"],["arabicForm","arabic-form"],["baselineShift","baseline-shift"],["capHeight","cap-height"],["clipPath","clip-path"],["clipRule","clip-rule"],["colorInterpolation","color-interpolation"],["colorInterpolationFilters","color-interpolation-filters"],["colorProfile","color-profile"],["colorRendering","color-rendering"],["dominantBaseline","dominant-baseline"],["enableBackground","enable-background"],["fillOpacity","fill-opacity"],["fillRule","fill-rule"],["floodColor","flood-color"],["floodOpacity","flood-opacity"],["fontFamily","font-family"],["fontSize","font-size"],["fontSizeAdjust","font-size-adjust"],["fontStretch","font-stretch"],["fontStyle","font-style"],["fontVariant","font-variant"],["fontWeight","font-weight"],["glyphName","glyph-name"],["glyphOrientationHorizontal","glyph-orientation-horizontal"],["glyphOrientationVertical","glyph-orientation-vertical"],["horizAdvX","horiz-adv-x"],["horizOriginX","horiz-origin-x"],["imageRendering","image-rendering"],["letterSpacing","letter-spacing"],["lightingColor","lighting-color"],["markerEnd","marker-end"],["markerMid","marker-mid"],["markerStart","marker-start"],["overlinePosition","overline-position"],["overlineThickness","overline-thickness"],["paintOrder","paint-order"],["panose-1","panose-1"],["pointerEvents","pointer-events"],["renderingIntent","rendering-intent"],["shapeRendering","shape-rendering"],["stopColor","stop-color"],["stopOpacity","stop-opacity"],["strikethroughPosition","strikethrough-position"],["strikethroughThickness","strikethrough-thickness"],["strokeDasharray","stroke-dasharray"],["strokeDashoffset","stroke-dashoffset"],["strokeLinecap","stroke-linecap"],["strokeLinejoin","stroke-linejoin"],["strokeMiterlimit","stroke-miterlimit"],["strokeOpacity","stroke-opacity"],["strokeWidth","stroke-width"],["textAnchor","text-anchor"],["textDecoration","text-decoration"],["textRendering","text-rendering"],["transformOrigin","transform-origin"],["underlinePosition","underline-position"],["underlineThickness","underline-thickness"],["unicodeBidi","unicode-bidi"],["unicodeRange","unicode-range"],["unitsPerEm","units-per-em"],["vAlphabetic","v-alphabetic"],["vHanging","v-hanging"],["vIdeographic","v-ideographic"],["vMathematical","v-mathematical"],["vectorEffect","vector-effect"],["vertAdvY","vert-adv-y"],["vertOriginX","vert-origin-x"],["vertOriginY","vert-origin-y"],["wordSpacing","word-spacing"],["writingMode","writing-mode"],["xmlnsXlink","xmlns:xlink"],["xHeight","x-height"]]),vh=/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;function Ji(t){return vh.test(""+t)?"javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')":t}function xn(){}var Bc=null;function Er(t){return t=t.target||t.srcElement||window,t.correspondingUseElement&&(t=t.correspondingUseElement),t.nodeType===3?t.parentNode:t}var ia=null,ga=null;function tf(t){var e=Da(t);if(e&&(t=e.stateNode)){var n=t[_e]||null;t:switch(t=e.stateNode,e.type){case"input":if(Oc(t,n.value,n.defaultValue,n.defaultValue,n.checked,n.defaultChecked,n.type,n.name),e=n.name,n.type==="radio"&&e!=null){for(n=t;n.parentNode;)n=n.parentNode;for(n=n.querySelectorAll('input[name="'+Ye(""+e)+'"][type="radio"]'),e=0;e<n.length;e++){var l=n[e];if(l!==t&&l.form===t.form){var a=l[_e]||null;if(!a)throw Error(w(90));Oc(l,a.value,a.defaultValue,a.defaultValue,a.checked,a.defaultChecked,a.type,a.name)}}for(e=0;e<n.length;e++)l=n[e],l.form===t.form&&B1(l)}break t;case"textarea":H1(t,n.value,n.defaultValue);break t;case"select":e=n.value,e!=null&&ya(t,!!n.multiple,e,!1)}}}var Ju=!1;function j1(t,e,n){if(Ju)return t(e,n);Ju=!0;try{var l=t(e);return l}finally{if(Ju=!1,(ia!==null||ga!==null)&&(Ws(),ia&&(e=ia,t=ga,ga=ia=null,tf(e),t)))for(e=0;e<t.length;e++)tf(t[e])}}function Oo(t,e){var n=t.stateNode;if(n===null)return null;var l=n[_e]||null;if(l===null)return null;n=l[e];t:switch(e){case"onClick":case"onClickCapture":case"onDoubleClick":case"onDoubleClickCapture":case"onMouseDown":case"onMouseDownCapture":case"onMouseMove":case"onMouseMoveCapture":case"onMouseUp":case"onMouseUpCapture":case"onMouseEnter":(l=!l.disabled)||(t=t.type,l=!(t==="button"||t==="input"||t==="select"||t==="textarea")),t=!l;break t;default:t=!1}if(t)return null;if(n&&typeof n!="function")throw Error(w(231,e,typeof n));return n}var Tn=!(typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"),Yc=!1;if(Tn)try{Fl={},Object.defineProperty(Fl,"passive",{get:function(){Yc=!0}}),window.addEventListener("test",Fl,Fl),window.removeEventListener("test",Fl,Fl)}catch{Yc=!1}var Fl,Zn=null,Tr=null,Wi=null;function X1(){if(Wi)return Wi;var t,e=Tr,n=e.length,l,a="value"in Zn?Zn.value:Zn.textContent,o=a.length;for(t=0;t<n&&e[t]===a[t];t++);var i=n-t;for(l=1;l<=i&&e[n-l]===a[o-l];l++);return Wi=a.slice(t,1<l?1-l:void 0)}function Ii(t){var e=t.keyCode;return"charCode"in t?(t=t.charCode,t===0&&e===13&&(t=13)):t=e,t===10&&(t=13),32<=t||t===13?t:0}function Bi(){return!0}function ef(){return!1}function fe(t){function e(n,l,a,o,i){this._reactName=n,this._targetInst=a,this.type=l,this.nativeEvent=o,this.target=i,this.currentTarget=null;for(var s in t)t.hasOwnProperty(s)&&(n=t[s],this[s]=n?n(o):o[s]);return this.isDefaultPrevented=(o.defaultPrevented!=null?o.defaultPrevented:o.returnValue===!1)?Bi:ef,this.isPropagationStopped=ef,this}return Ct(e.prototype,{preventDefault:function(){this.defaultPrevented=!0;var n=this.nativeEvent;n&&(n.preventDefault?n.preventDefault():typeof n.returnValue!="unknown"&&(n.returnValue=!1),this.isDefaultPrevented=Bi)},stopPropagation:function(){var n=this.nativeEvent;n&&(n.stopPropagation?n.stopPropagation():typeof n.cancelBubble!="unknown"&&(n.cancelBubble=!0),this.isPropagationStopped=Bi)},persist:function(){},isPersistent:Bi}),e}var Ll={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(t){return t.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},Us=fe(Ll),Io=Ct({},Ll,{view:0,detail:0}),xh=fe(Io),Wu,Iu,so,js=Ct({},Io,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:Ar,button:0,buttons:0,relatedTarget:function(t){return t.relatedTarget===void 0?t.fromElement===t.srcElement?t.toElement:t.fromElement:t.relatedTarget},movementX:function(t){return"movementX"in t?t.movementX:(t!==so&&(so&&t.type==="mousemove"?(Wu=t.screenX-so.screenX,Iu=t.screenY-so.screenY):Iu=Wu=0,so=t),Wu)},movementY:function(t){return"movementY"in t?t.movementY:Iu}}),nf=fe(js),Ch=Ct({},js,{dataTransfer:0}),Sh=fe(Ch),wh=Ct({},Io,{relatedTarget:0}),Fu=fe(wh),Eh=Ct({},Ll,{animationName:0,elapsedTime:0,pseudoElement:0}),Th=fe(Eh),Ah=Ct({},Ll,{clipboardData:function(t){return"clipboardData"in t?t.clipboardData:window.clipboardData}}),kh=fe(Ah),Mh=Ct({},Ll,{data:0}),lf=fe(Mh),zh={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},Lh={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},Nh={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function Oh(t){var e=this.nativeEvent;return e.getModifierState?e.getModifierState(t):(t=Nh[t])?!!e[t]:!1}function Ar(){return Oh}var Dh=Ct({},Io,{key:function(t){if(t.key){var e=zh[t.key]||t.key;if(e!=="Unidentified")return e}return t.type==="keypress"?(t=Ii(t),t===13?"Enter":String.fromCharCode(t)):t.type==="keydown"||t.type==="keyup"?Lh[t.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:Ar,charCode:function(t){return t.type==="keypress"?Ii(t):0},keyCode:function(t){return t.type==="keydown"||t.type==="keyup"?t.keyCode:0},which:function(t){return t.type==="keypress"?Ii(t):t.type==="keydown"||t.type==="keyup"?t.keyCode:0}}),Bh=fe(Dh),Yh=Ct({},js,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),af=fe(Yh),Hh=Ct({},Io,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:Ar}),Rh=fe(Hh),Uh=Ct({},Ll,{propertyName:0,elapsedTime:0,pseudoElement:0}),jh=fe(Uh),Xh=Ct({},js,{deltaX:function(t){return"deltaX"in t?t.deltaX:"wheelDeltaX"in t?-t.wheelDeltaX:0},deltaY:function(t){return"deltaY"in t?t.deltaY:"wheelDeltaY"in t?-t.wheelDeltaY:"wheelDelta"in t?-t.wheelDelta:0},deltaZ:0,deltaMode:0}),Qh=fe(Xh),qh=Ct({},Ll,{newState:0,oldState:0}),Zh=fe(qh),Gh=[9,13,27,32],kr=Tn&&"CompositionEvent"in window,bo=null;Tn&&"documentMode"in document&&(bo=document.documentMode);var $h=Tn&&"TextEvent"in window&&!bo,Q1=Tn&&(!kr||bo&&8<bo&&11>=bo),of=" ",sf=!1;function q1(t,e){switch(t){case"keyup":return Gh.indexOf(e.keyCode)!==-1;case"keydown":return e.keyCode!==229;case"keypress":case"mousedown":case"focusout":return!0;default:return!1}}function Z1(t){return t=t.detail,typeof t=="object"&&"data"in t?t.data:null}var sa=!1;function Vh(t,e){switch(t){case"compositionend":return Z1(e);case"keypress":return e.which!==32?null:(sf=!0,of);case"textInput":return t=e.data,t===of&&sf?null:t;default:return null}}function Kh(t,e){if(sa)return t==="compositionend"||!kr&&q1(t,e)?(t=X1(),Wi=Tr=Zn=null,sa=!1,t):null;switch(t){case"paste":return null;case"keypress":if(!(e.ctrlKey||e.altKey||e.metaKey)||e.ctrlKey&&e.altKey){if(e.char&&1<e.char.length)return e.char;if(e.which)return String.fromCharCode(e.which)}return null;case"compositionend":return Q1&&e.locale!=="ko"?null:e.data;default:return null}}var Jh={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function uf(t){var e=t&&t.nodeName&&t.nodeName.toLowerCase();return e==="input"?!!Jh[t.type]:e==="textarea"}function G1(t,e,n,l){ia?ga?ga.push(l):ga=[l]:ia=l,e=Ls(e,"onChange"),0<e.length&&(n=new Us("onChange","change",null,n,l),t.push({event:n,listeners:e}))}var vo=null,Do=null;function Wh(t){jm(t,0)}function Xs(t){var e=yo(t);if(B1(e))return t}function cf(t,e){if(t==="change")return e}var $1=!1;Tn&&(Tn?(Hi="oninput"in document,Hi||(Pu=document.createElement("div"),Pu.setAttribute("oninput","return;"),Hi=typeof Pu.oninput=="function"),Yi=Hi):Yi=!1,$1=Yi&&(!document.documentMode||9<document.documentMode));var Yi,Hi,Pu;function rf(){vo&&(vo.detachEvent("onpropertychange",V1),Do=vo=null)}function V1(t){if(t.propertyName==="value"&&Xs(Do)){var e=[];G1(e,Do,t,Er(t)),j1(Wh,e)}}function Ih(t,e,n){t==="focusin"?(rf(),vo=e,Do=n,vo.attachEvent("onpropertychange",V1)):t==="focusout"&&rf()}function Fh(t){if(t==="selectionchange"||t==="keyup"||t==="keydown")return Xs(Do)}function Ph(t,e){if(t==="click")return Xs(e)}function ty(t,e){if(t==="input"||t==="change")return Xs(e)}function ey(t,e){return t===e&&(t!==0||1/t===1/e)||t!==t&&e!==e}var Te=typeof Object.is=="function"?Object.is:ey;function Bo(t,e){if(Te(t,e))return!0;if(typeof t!="object"||t===null||typeof e!="object"||e===null)return!1;var n=Object.keys(t),l=Object.keys(e);if(n.length!==l.length)return!1;for(l=0;l<n.length;l++){var a=n[l];if(!zc.call(e,a)||!Te(t[a],e[a]))return!1}return!0}function df(t){for(;t&&t.firstChild;)t=t.firstChild;return t}function _f(t,e){var n=df(t);t=0;for(var l;n;){if(n.nodeType===3){if(l=t+n.textContent.length,t<=e&&l>=e)return{node:n,offset:e-t};t=l}t:{for(;n;){if(n.nextSibling){n=n.nextSibling;break t}n=n.parentNode}n=void 0}n=df(n)}}function K1(t,e){return t&&e?t===e?!0:t&&t.nodeType===3?!1:e&&e.nodeType===3?K1(t,e.parentNode):"contains"in t?t.contains(e):t.compareDocumentPosition?!!(t.compareDocumentPosition(e)&16):!1:!1}function J1(t){t=t!=null&&t.ownerDocument!=null&&t.ownerDocument.defaultView!=null?t.ownerDocument.defaultView:window;for(var e=fs(t.document);e instanceof t.HTMLIFrameElement;){try{var n=typeof e.contentWindow.location.href=="string"}catch{n=!1}if(n)t=e.contentWindow;else break;e=fs(t.document)}return e}function Mr(t){var e=t&&t.nodeName&&t.nodeName.toLowerCase();return e&&(e==="input"&&(t.type==="text"||t.type==="search"||t.type==="tel"||t.type==="url"||t.type==="password")||e==="textarea"||t.contentEditable==="true")}var ny=Tn&&"documentMode"in document&&11>=document.documentMode,ua=null,Hc=null,xo=null,Rc=!1;function ff(t,e,n){var l=n.window===n?n.document:n.nodeType===9?n:n.ownerDocument;Rc||ua==null||ua!==fs(l)||(l=ua,"selectionStart"in l&&Mr(l)?l={start:l.selectionStart,end:l.selectionEnd}:(l=(l.ownerDocument&&l.ownerDocument.defaultView||window).getSelection(),l={anchorNode:l.anchorNode,anchorOffset:l.anchorOffset,focusNode:l.focusNode,focusOffset:l.focusOffset}),xo&&Bo(xo,l)||(xo=l,l=Ls(Hc,"onSelect"),0<l.length&&(e=new Us("onSelect","select",null,e,n),t.push({event:e,listeners:l}),e.target=ua)))}function hl(t,e){var n={};return n[t.toLowerCase()]=e.toLowerCase(),n["Webkit"+t]="webkit"+e,n["Moz"+t]="moz"+e,n}var ca={animationend:hl("Animation","AnimationEnd"),animationiteration:hl("Animation","AnimationIteration"),animationstart:hl("Animation","AnimationStart"),transitionrun:hl("Transition","TransitionRun"),transitionstart:hl("Transition","TransitionStart"),transitioncancel:hl("Transition","TransitionCancel"),transitionend:hl("Transition","TransitionEnd")},tc={},W1={};Tn&&(W1=document.createElement("div").style,"AnimationEvent"in window||(delete ca.animationend.animation,delete ca.animationiteration.animation,delete ca.animationstart.animation),"TransitionEvent"in window||delete ca.transitionend.transition);function Nl(t){if(tc[t])return tc[t];if(!ca[t])return t;var e=ca[t],n;for(n in e)if(e.hasOwnProperty(n)&&n in W1)return tc[t]=e[n];return t}var I1=Nl("animationend"),F1=Nl("animationiteration"),P1=Nl("animationstart"),ly=Nl("transitionrun"),ay=Nl("transitionstart"),oy=Nl("transitioncancel"),t0=Nl("transitionend"),e0=new Map,Uc="abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");Uc.push("scrollEnd");function Ge(t,e){e0.set(t,e),zl(e,[t])}var ms=typeof reportError=="function"?reportError:function(t){if(typeof window=="object"&&typeof window.ErrorEvent=="function"){var e=new window.ErrorEvent("error",{bubbles:!0,cancelable:!0,message:typeof t=="object"&&t!==null&&typeof t.message=="string"?String(t.message):String(t),error:t});if(!window.dispatchEvent(e))return}else if(typeof process=="object"&&typeof process.emit=="function"){process.emit("uncaughtException",t);return}console.error(t)},Ne=[],ra=0,zr=0;function Qs(){for(var t=ra,e=zr=ra=0;e<t;){var n=Ne[e];Ne[e++]=null;var l=Ne[e];Ne[e++]=null;var a=Ne[e];Ne[e++]=null;var o=Ne[e];if(Ne[e++]=null,l!==null&&a!==null){var i=l.pending;i===null?a.next=a:(a.next=i.next,i.next=a),l.pending=a}o!==0&&n0(n,a,o)}}function qs(t,e,n,l){Ne[ra++]=t,Ne[ra++]=e,Ne[ra++]=n,Ne[ra++]=l,zr|=l,t.lanes|=l,t=t.alternate,t!==null&&(t.lanes|=l)}function Lr(t,e,n,l){return qs(t,e,n,l),hs(t)}function Ol(t,e){return qs(t,null,null,e),hs(t)}function n0(t,e,n){t.lanes|=n;var l=t.alternate;l!==null&&(l.lanes|=n);for(var a=!1,o=t.return;o!==null;)o.childLanes|=n,l=o.alternate,l!==null&&(l.childLanes|=n),o.tag===22&&(t=o.stateNode,t===null||t._visibility&1||(a=!0)),t=o,o=o.return;return t.tag===3?(o=t.stateNode,a&&e!==null&&(a=31-we(n),t=o.hiddenUpdates,l=t[a],l===null?t[a]=[e]:l.push(e),e.lane=n|536870912),o):null}function hs(t){if(50<zo)throw zo=0,ir=null,Error(w(185));for(var e=t.return;e!==null;)t=e,e=t.return;return t.tag===3?t.stateNode:null}var da={};function iy(t,e,n,l){this.tag=t,this.key=n,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.refCleanup=this.ref=null,this.pendingProps=e,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=l,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function ve(t,e,n,l){return new iy(t,e,n,l)}function Nr(t){return t=t.prototype,!(!t||!t.isReactComponent)}function Sn(t,e){var n=t.alternate;return n===null?(n=ve(t.tag,e,t.key,t.mode),n.elementType=t.elementType,n.type=t.type,n.stateNode=t.stateNode,n.alternate=t,t.alternate=n):(n.pendingProps=e,n.type=t.type,n.flags=0,n.subtreeFlags=0,n.deletions=null),n.flags=t.flags&65011712,n.childLanes=t.childLanes,n.lanes=t.lanes,n.child=t.child,n.memoizedProps=t.memoizedProps,n.memoizedState=t.memoizedState,n.updateQueue=t.updateQueue,e=t.dependencies,n.dependencies=e===null?null:{lanes:e.lanes,firstContext:e.firstContext},n.sibling=t.sibling,n.index=t.index,n.ref=t.ref,n.refCleanup=t.refCleanup,n}function l0(t,e){t.flags&=65011714;var n=t.alternate;return n===null?(t.childLanes=0,t.lanes=e,t.child=null,t.subtreeFlags=0,t.memoizedProps=null,t.memoizedState=null,t.updateQueue=null,t.dependencies=null,t.stateNode=null):(t.childLanes=n.childLanes,t.lanes=n.lanes,t.child=n.child,t.subtreeFlags=0,t.deletions=null,t.memoizedProps=n.memoizedProps,t.memoizedState=n.memoizedState,t.updateQueue=n.updateQueue,t.type=n.type,e=n.dependencies,t.dependencies=e===null?null:{lanes:e.lanes,firstContext:e.firstContext}),t}function Fi(t,e,n,l,a,o){var i=0;if(l=t,typeof t=="function")Nr(t)&&(i=1);else if(typeof t=="string")i=cg(t,n,nn.current)?26:t==="html"||t==="head"||t==="body"?27:5;else t:switch(t){case Tc:return t=ve(31,n,e,a),t.elementType=Tc,t.lanes=o,t;case la:return xl(n.children,a,o,e);case C1:i=8,a|=24;break;case Sc:return t=ve(12,n,e,a|2),t.elementType=Sc,t.lanes=o,t;case wc:return t=ve(13,n,e,a),t.elementType=wc,t.lanes=o,t;case Ec:return t=ve(19,n,e,a),t.elementType=Ec,t.lanes=o,t;default:if(typeof t=="object"&&t!==null)switch(t.$$typeof){case vn:i=10;break t;case S1:i=9;break t;case pr:i=11;break t;case br:i=14;break t;case Hn:i=16,l=null;break t}i=29,n=Error(w(130,t===null?"null":typeof t,"")),l=null}return e=ve(i,n,e,a),e.elementType=t,e.type=l,e.lanes=o,e}function xl(t,e,n,l){return t=ve(7,t,l,e),t.lanes=n,t}function ec(t,e,n){return t=ve(6,t,null,e),t.lanes=n,t}function a0(t){var e=ve(18,null,null,0);return e.stateNode=t,e}function nc(t,e,n){return e=ve(4,t.children!==null?t.children:[],t.key,e),e.lanes=n,e.stateNode={containerInfo:t.containerInfo,pendingChildren:null,implementation:t.implementation},e}var mf=new WeakMap;function He(t,e){if(typeof t=="object"&&t!==null){var n=mf.get(t);return n!==void 0?n:(e={value:t,source:e,stack:K_(e)},mf.set(t,e),e)}return{value:t,source:e,stack:K_(e)}}var _a=[],fa=0,ys=null,Yo=0,De=[],Be=0,ll=null,Pe=1,tn="";function pn(t,e){_a[fa++]=Yo,_a[fa++]=ys,ys=t,Yo=e}function o0(t,e,n){De[Be++]=Pe,De[Be++]=tn,De[Be++]=ll,ll=t;var l=Pe;t=tn;var a=32-we(l)-1;l&=~(1<<a),n+=1;var o=32-we(e)+a;if(30<o){var i=a-a%5;o=(l&(1<<i)-1).toString(32),l>>=i,a-=i,Pe=1<<32-we(e)+a|n<<a|l,tn=o+t}else Pe=1<<o|n<<a|l,tn=t}function Or(t){t.return!==null&&(pn(t,1),o0(t,1,0))}function Dr(t){for(;t===ys;)ys=_a[--fa],_a[fa]=null,Yo=_a[--fa],_a[fa]=null;for(;t===ll;)ll=De[--Be],De[Be]=null,tn=De[--Be],De[Be]=null,Pe=De[--Be],De[Be]=null}function i0(t,e){De[Be++]=Pe,De[Be++]=tn,De[Be++]=ll,Pe=e.id,tn=e.overflow,ll=t}var Jt=null,xt=null,it=!1,Jn=null,Re=!1,jc=Error(w(519));function al(t){var e=Error(w(418,1<arguments.length&&arguments[1]!==void 0&&arguments[1]?"text":"HTML",""));throw Ho(He(e,t)),jc}function hf(t){var e=t.stateNode,n=t.type,l=t.memoizedProps;switch(e[Kt]=t,e[_e]=l,n){case"dialog":et("cancel",e),et("close",e);break;case"iframe":case"object":case"embed":et("load",e);break;case"video":case"audio":for(n=0;n<Xo.length;n++)et(Xo[n],e);break;case"source":et("error",e);break;case"img":case"image":case"link":et("error",e),et("load",e);break;case"details":et("toggle",e);break;case"input":et("invalid",e),Y1(e,l.value,l.defaultValue,l.checked,l.defaultChecked,l.type,l.name,!0);break;case"select":et("invalid",e);break;case"textarea":et("invalid",e),R1(e,l.value,l.defaultValue,l.children)}n=l.children,typeof n!="string"&&typeof n!="number"&&typeof n!="bigint"||e.textContent===""+n||l.suppressHydrationWarning===!0||Qm(e.textContent,n)?(l.popover!=null&&(et("beforetoggle",e),et("toggle",e)),l.onScroll!=null&&et("scroll",e),l.onScrollEnd!=null&&et("scrollend",e),l.onClick!=null&&(e.onclick=xn),e=!0):e=!1,e||al(t,!0)}function yf(t){for(Jt=t.return;Jt;)switch(Jt.tag){case 5:case 31:case 13:Re=!1;return;case 27:case 3:Re=!0;return;default:Jt=Jt.return}}function Pl(t){if(t!==Jt)return!1;if(!it)return yf(t),it=!0,!1;var e=t.tag,n;if((n=e!==3&&e!==27)&&((n=e===5)&&(n=t.type,n=!(n!=="form"&&n!=="button")||dr(t.type,t.memoizedProps)),n=!n),n&&xt&&al(t),yf(t),e===13){if(t=t.memoizedState,t=t!==null?t.dehydrated:null,!t)throw Error(w(317));xt=a1(t)}else if(e===31){if(t=t.memoizedState,t=t!==null?t.dehydrated:null,!t)throw Error(w(317));xt=a1(t)}else e===27?(e=xt,ul(t.type)?(t=hr,hr=null,xt=t):xt=e):xt=Jt?je(t.stateNode.nextSibling):null;return!0}function El(){xt=Jt=null,it=!1}function lc(){var t=Jn;return t!==null&&(re===null?re=t:re.push.apply(re,t),Jn=null),t}function Ho(t){Jn===null?Jn=[t]:Jn.push(t)}var Xc=ln(null),Dl=null,Cn=null;function Un(t,e,n){pt(Xc,e._currentValue),e._currentValue=n}function wn(t){t._currentValue=Xc.current,$t(Xc)}function Qc(t,e,n){for(;t!==null;){var l=t.alternate;if((t.childLanes&e)!==e?(t.childLanes|=e,l!==null&&(l.childLanes|=e)):l!==null&&(l.childLanes&e)!==e&&(l.childLanes|=e),t===n)break;t=t.return}}function qc(t,e,n,l){var a=t.child;for(a!==null&&(a.return=t);a!==null;){var o=a.dependencies;if(o!==null){var i=a.child;o=o.firstContext;t:for(;o!==null;){var s=o;o=a;for(var u=0;u<e.length;u++)if(s.context===e[u]){o.lanes|=n,s=o.alternate,s!==null&&(s.lanes|=n),Qc(o.return,n,t),l||(i=null);break t}o=s.next}}else if(a.tag===18){if(i=a.return,i===null)throw Error(w(341));i.lanes|=n,o=i.alternate,o!==null&&(o.lanes|=n),Qc(i,n,t),i=null}else i=a.child;if(i!==null)i.return=a;else for(i=a;i!==null;){if(i===t){i=null;break}if(a=i.sibling,a!==null){a.return=i.return,i=a;break}i=i.return}a=i}}function Ba(t,e,n,l){t=null;for(var a=e,o=!1;a!==null;){if(!o){if(a.flags&524288)o=!0;else if(a.flags&262144)break}if(a.tag===10){var i=a.alternate;if(i===null)throw Error(w(387));if(i=i.memoizedProps,i!==null){var s=a.type;Te(a.pendingProps.value,i.value)||(t!==null?t.push(s):t=[s])}}else if(a===cs.current){if(i=a.alternate,i===null)throw Error(w(387));i.memoizedState.memoizedState!==a.memoizedState.memoizedState&&(t!==null?t.push(qo):t=[qo])}a=a.return}t!==null&&qc(e,t,n,l),e.flags|=262144}function gs(t){for(t=t.firstContext;t!==null;){if(!Te(t.context._currentValue,t.memoizedValue))return!0;t=t.next}return!1}function Tl(t){Dl=t,Cn=null,t=t.dependencies,t!==null&&(t.firstContext=null)}function Wt(t){return s0(Dl,t)}function Ri(t,e){return Dl===null&&Tl(t),s0(t,e)}function s0(t,e){var n=e._currentValue;if(e={context:e,memoizedValue:n,next:null},Cn===null){if(t===null)throw Error(w(308));Cn=e,t.dependencies={lanes:0,firstContext:e},t.flags|=524288}else Cn=Cn.next=e;return n}var sy=typeof AbortController<"u"?AbortController:function(){var t=[],e=this.signal={aborted:!1,addEventListener:function(n,l){t.push(l)}};this.abort=function(){e.aborted=!0,t.forEach(function(n){return n()})}},uy=Qt.unstable_scheduleCallback,cy=Qt.unstable_NormalPriority,Rt={$$typeof:vn,Consumer:null,Provider:null,_currentValue:null,_currentValue2:null,_threadCount:0};function Br(){return{controller:new sy,data:new Map,refCount:0}}function Fo(t){t.refCount--,t.refCount===0&&uy(cy,function(){t.controller.abort()})}var Co=null,Zc=0,Ea=0,pa=null;function ry(t,e){if(Co===null){var n=Co=[];Zc=0,Ea=id(),pa={status:"pending",value:void 0,then:function(l){n.push(l)}}}return Zc++,e.then(gf,gf),e}function gf(){if(--Zc===0&&Co!==null){pa!==null&&(pa.status="fulfilled");var t=Co;Co=null,Ea=0,pa=null;for(var e=0;e<t.length;e++)(0,t[e])()}}function dy(t,e){var n=[],l={status:"pending",value:null,reason:null,then:function(a){n.push(a)}};return t.then(function(){l.status="fulfilled",l.value=e;for(var a=0;a<n.length;a++)(0,n[a])(e)},function(a){for(l.status="rejected",l.reason=a,a=0;a<n.length;a++)(0,n[a])(void 0)}),l}var pf=Q.S;Q.S=function(t,e){xm=Ce(),typeof e=="object"&&e!==null&&typeof e.then=="function"&&ry(t,e),pf!==null&&pf(t,e)};var Cl=ln(null);function Yr(){var t=Cl.current;return t!==null?t:gt.pooledCache}function Pi(t,e){e===null?pt(Cl,Cl.current):pt(Cl,e.pool)}function u0(){var t=Yr();return t===null?null:{parent:Rt._currentValue,pool:t}}var Ya=Error(w(460)),Hr=Error(w(474)),Zs=Error(w(542)),ps={then:function(){}};function bf(t){return t=t.status,t==="fulfilled"||t==="rejected"}function c0(t,e,n){switch(n=t[n],n===void 0?t.push(e):n!==e&&(e.then(xn,xn),e=n),e.status){case"fulfilled":return e.value;case"rejected":throw t=e.reason,xf(t),t;default:if(typeof e.status=="string")e.then(xn,xn);else{if(t=gt,t!==null&&100<t.shellSuspendCounter)throw Error(w(482));t=e,t.status="pending",t.then(function(l){if(e.status==="pending"){var a=e;a.status="fulfilled",a.value=l}},function(l){if(e.status==="pending"){var a=e;a.status="rejected",a.reason=l}})}switch(e.status){case"fulfilled":return e.value;case"rejected":throw t=e.reason,xf(t),t}throw Sl=e,Ya}}function pl(t){try{var e=t._init;return e(t._payload)}catch(n){throw n!==null&&typeof n=="object"&&typeof n.then=="function"?(Sl=n,Ya):n}}var Sl=null;function vf(){if(Sl===null)throw Error(w(459));var t=Sl;return Sl=null,t}function xf(t){if(t===Ya||t===Zs)throw Error(w(483))}var ba=null,Ro=0;function Ui(t){var e=Ro;return Ro+=1,ba===null&&(ba=[]),c0(ba,t,e)}function uo(t,e){e=e.props.ref,t.ref=e!==void 0?e:null}function ji(t,e){throw e.$$typeof===I2?Error(w(525)):(t=Object.prototype.toString.call(e),Error(w(31,t==="[object Object]"?"object with keys {"+Object.keys(e).join(", ")+"}":t)))}function r0(t){function e(f,_){if(t){var p=f.deletions;p===null?(f.deletions=[_],f.flags|=16):p.push(_)}}function n(f,_){if(!t)return null;for(;_!==null;)e(f,_),_=_.sibling;return null}function l(f){for(var _=new Map;f!==null;)f.key!==null?_.set(f.key,f):_.set(f.index,f),f=f.sibling;return _}function a(f,_){return f=Sn(f,_),f.index=0,f.sibling=null,f}function o(f,_,p){return f.index=p,t?(p=f.alternate,p!==null?(p=p.index,p<_?(f.flags|=67108866,_):p):(f.flags|=67108866,_)):(f.flags|=1048576,_)}function i(f){return t&&f.alternate===null&&(f.flags|=67108866),f}function s(f,_,p,C){return _===null||_.tag!==6?(_=ec(p,f.mode,C),_.return=f,_):(_=a(_,p),_.return=f,_)}function u(f,_,p,C){var B=p.type;return B===la?h(f,_,p.props.children,C,p.key):_!==null&&(_.elementType===B||typeof B=="object"&&B!==null&&B.$$typeof===Hn&&pl(B)===_.type)?(_=a(_,p.props),uo(_,p),_.return=f,_):(_=Fi(p.type,p.key,p.props,null,f.mode,C),uo(_,p),_.return=f,_)}function m(f,_,p,C){return _===null||_.tag!==4||_.stateNode.containerInfo!==p.containerInfo||_.stateNode.implementation!==p.implementation?(_=nc(p,f.mode,C),_.return=f,_):(_=a(_,p.children||[]),_.return=f,_)}function h(f,_,p,C,B){return _===null||_.tag!==7?(_=xl(p,f.mode,C,B),_.return=f,_):(_=a(_,p),_.return=f,_)}function v(f,_,p){if(typeof _=="string"&&_!==""||typeof _=="number"||typeof _=="bigint")return _=ec(""+_,f.mode,p),_.return=f,_;if(typeof _=="object"&&_!==null){switch(_.$$typeof){case zi:return p=Fi(_.type,_.key,_.props,null,f.mode,p),uo(p,_),p.return=f,p;case mo:return _=nc(_,f.mode,p),_.return=f,_;case Hn:return _=pl(_),v(f,_,p)}if(ho(_)||io(_))return _=xl(_,f.mode,p,null),_.return=f,_;if(typeof _.then=="function")return v(f,Ui(_),p);if(_.$$typeof===vn)return v(f,Ri(f,_),p);ji(f,_)}return null}function g(f,_,p,C){var B=_!==null?_.key:null;if(typeof p=="string"&&p!==""||typeof p=="number"||typeof p=="bigint")return B!==null?null:s(f,_,""+p,C);if(typeof p=="object"&&p!==null){switch(p.$$typeof){case zi:return p.key===B?u(f,_,p,C):null;case mo:return p.key===B?m(f,_,p,C):null;case Hn:return p=pl(p),g(f,_,p,C)}if(ho(p)||io(p))return B!==null?null:h(f,_,p,C,null);if(typeof p.then=="function")return g(f,_,Ui(p),C);if(p.$$typeof===vn)return g(f,_,Ri(f,p),C);ji(f,p)}return null}function b(f,_,p,C,B){if(typeof C=="string"&&C!==""||typeof C=="number"||typeof C=="bigint")return f=f.get(p)||null,s(_,f,""+C,B);if(typeof C=="object"&&C!==null){switch(C.$$typeof){case zi:return f=f.get(C.key===null?p:C.key)||null,u(_,f,C,B);case mo:return f=f.get(C.key===null?p:C.key)||null,m(_,f,C,B);case Hn:return C=pl(C),b(f,_,p,C,B)}if(ho(C)||io(C))return f=f.get(p)||null,h(_,f,C,B,null);if(typeof C.then=="function")return b(f,_,p,Ui(C),B);if(C.$$typeof===vn)return b(f,_,p,Ri(_,C),B);ji(_,C)}return null}function T(f,_,p,C){for(var B=null,X=null,N=_,H=_=0,G=null;N!==null&&H<p.length;H++){N.index>H?(G=N,N=null):G=N.sibling;var I=g(f,N,p[H],C);if(I===null){N===null&&(N=G);break}t&&N&&I.alternate===null&&e(f,N),_=o(I,_,H),X===null?B=I:X.sibling=I,X=I,N=G}if(H===p.length)return n(f,N),it&&pn(f,H),B;if(N===null){for(;H<p.length;H++)N=v(f,p[H],C),N!==null&&(_=o(N,_,H),X===null?B=N:X.sibling=N,X=N);return it&&pn(f,H),B}for(N=l(N);H<p.length;H++)G=b(N,f,H,p[H],C),G!==null&&(t&&G.alternate!==null&&N.delete(G.key===null?H:G.key),_=o(G,_,H),X===null?B=G:X.sibling=G,X=G);return t&&N.forEach(function(ke){return e(f,ke)}),it&&pn(f,H),B}function O(f,_,p,C){if(p==null)throw Error(w(151));for(var B=null,X=null,N=_,H=_=0,G=null,I=p.next();N!==null&&!I.done;H++,I=p.next()){N.index>H?(G=N,N=null):G=N.sibling;var ke=g(f,N,I.value,C);if(ke===null){N===null&&(N=G);break}t&&N&&ke.alternate===null&&e(f,N),_=o(ke,_,H),X===null?B=ke:X.sibling=ke,X=ke,N=G}if(I.done)return n(f,N),it&&pn(f,H),B;if(N===null){for(;!I.done;H++,I=p.next())I=v(f,I.value,C),I!==null&&(_=o(I,_,H),X===null?B=I:X.sibling=I,X=I);return it&&pn(f,H),B}for(N=l(N);!I.done;H++,I=p.next())I=b(N,f,H,I.value,C),I!==null&&(t&&I.alternate!==null&&N.delete(I.key===null?H:I.key),_=o(I,_,H),X===null?B=I:X.sibling=I,X=I);return t&&N.forEach(function(D){return e(f,D)}),it&&pn(f,H),B}function L(f,_,p,C){if(typeof p=="object"&&p!==null&&p.type===la&&p.key===null&&(p=p.props.children),typeof p=="object"&&p!==null){switch(p.$$typeof){case zi:t:{for(var B=p.key;_!==null;){if(_.key===B){if(B=p.type,B===la){if(_.tag===7){n(f,_.sibling),C=a(_,p.props.children),C.return=f,f=C;break t}}else if(_.elementType===B||typeof B=="object"&&B!==null&&B.$$typeof===Hn&&pl(B)===_.type){n(f,_.sibling),C=a(_,p.props),uo(C,p),C.return=f,f=C;break t}n(f,_);break}else e(f,_);_=_.sibling}p.type===la?(C=xl(p.props.children,f.mode,C,p.key),C.return=f,f=C):(C=Fi(p.type,p.key,p.props,null,f.mode,C),uo(C,p),C.return=f,f=C)}return i(f);case mo:t:{for(B=p.key;_!==null;){if(_.key===B)if(_.tag===4&&_.stateNode.containerInfo===p.containerInfo&&_.stateNode.implementation===p.implementation){n(f,_.sibling),C=a(_,p.children||[]),C.return=f,f=C;break t}else{n(f,_);break}else e(f,_);_=_.sibling}C=nc(p,f.mode,C),C.return=f,f=C}return i(f);case Hn:return p=pl(p),L(f,_,p,C)}if(ho(p))return T(f,_,p,C);if(io(p)){if(B=io(p),typeof B!="function")throw Error(w(150));return p=B.call(p),O(f,_,p,C)}if(typeof p.then=="function")return L(f,_,Ui(p),C);if(p.$$typeof===vn)return L(f,_,Ri(f,p),C);ji(f,p)}return typeof p=="string"&&p!==""||typeof p=="number"||typeof p=="bigint"?(p=""+p,_!==null&&_.tag===6?(n(f,_.sibling),C=a(_,p),C.return=f,f=C):(n(f,_),C=ec(p,f.mode,C),C.return=f,f=C),i(f)):n(f,_)}return function(f,_,p,C){try{Ro=0;var B=L(f,_,p,C);return ba=null,B}catch(N){if(N===Ya||N===Zs)throw N;var X=ve(29,N,null,f.mode);return X.lanes=C,X.return=f,X}finally{}}}var Al=r0(!0),d0=r0(!1),Rn=!1;function Rr(t){t.updateQueue={baseState:t.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,lanes:0,hiddenCallbacks:null},callbacks:null}}function Gc(t,e){t=t.updateQueue,e.updateQueue===t&&(e.updateQueue={baseState:t.baseState,firstBaseUpdate:t.firstBaseUpdate,lastBaseUpdate:t.lastBaseUpdate,shared:t.shared,callbacks:null})}function Wn(t){return{lane:t,tag:0,payload:null,callback:null,next:null}}function In(t,e,n){var l=t.updateQueue;if(l===null)return null;if(l=l.shared,ct&2){var a=l.pending;return a===null?e.next=e:(e.next=a.next,a.next=e),l.pending=e,e=hs(t),n0(t,null,n),e}return qs(t,l,e,n),hs(t)}function So(t,e,n){if(e=e.updateQueue,e!==null&&(e=e.shared,(n&4194048)!==0)){var l=e.lanes;l&=t.pendingLanes,n|=l,e.lanes=n,M1(t,n)}}function ac(t,e){var n=t.updateQueue,l=t.alternate;if(l!==null&&(l=l.updateQueue,n===l)){var a=null,o=null;if(n=n.firstBaseUpdate,n!==null){do{var i={lane:n.lane,tag:n.tag,payload:n.payload,callback:null,next:null};o===null?a=o=i:o=o.next=i,n=n.next}while(n!==null);o===null?a=o=e:o=o.next=e}else a=o=e;n={baseState:l.baseState,firstBaseUpdate:a,lastBaseUpdate:o,shared:l.shared,callbacks:l.callbacks},t.updateQueue=n;return}t=n.lastBaseUpdate,t===null?n.firstBaseUpdate=e:t.next=e,n.lastBaseUpdate=e}var $c=!1;function wo(){if($c){var t=pa;if(t!==null)throw t}}function Eo(t,e,n,l){$c=!1;var a=t.updateQueue;Rn=!1;var o=a.firstBaseUpdate,i=a.lastBaseUpdate,s=a.shared.pending;if(s!==null){a.shared.pending=null;var u=s,m=u.next;u.next=null,i===null?o=m:i.next=m,i=u;var h=t.alternate;h!==null&&(h=h.updateQueue,s=h.lastBaseUpdate,s!==i&&(s===null?h.firstBaseUpdate=m:s.next=m,h.lastBaseUpdate=u))}if(o!==null){var v=a.baseState;i=0,h=m=u=null,s=o;do{var g=s.lane&-536870913,b=g!==s.lane;if(b?(at&g)===g:(l&g)===g){g!==0&&g===Ea&&($c=!0),h!==null&&(h=h.next={lane:0,tag:s.tag,payload:s.payload,callback:null,next:null});t:{var T=t,O=s;g=e;var L=n;switch(O.tag){case 1:if(T=O.payload,typeof T=="function"){v=T.call(L,v,g);break t}v=T;break t;case 3:T.flags=T.flags&-65537|128;case 0:if(T=O.payload,g=typeof T=="function"?T.call(L,v,g):T,g==null)break t;v=Ct({},v,g);break t;case 2:Rn=!0}}g=s.callback,g!==null&&(t.flags|=64,b&&(t.flags|=8192),b=a.callbacks,b===null?a.callbacks=[g]:b.push(g))}else b={lane:g,tag:s.tag,payload:s.payload,callback:s.callback,next:null},h===null?(m=h=b,u=v):h=h.next=b,i|=g;if(s=s.next,s===null){if(s=a.shared.pending,s===null)break;b=s,s=b.next,b.next=null,a.lastBaseUpdate=b,a.shared.pending=null}}while(!0);h===null&&(u=v),a.baseState=u,a.firstBaseUpdate=m,a.lastBaseUpdate=h,o===null&&(a.shared.lanes=0),il|=i,t.lanes=i,t.memoizedState=v}}function _0(t,e){if(typeof t!="function")throw Error(w(191,t));t.call(e)}function f0(t,e){var n=t.callbacks;if(n!==null)for(t.callbacks=null,t=0;t<n.length;t++)_0(n[t],e)}var Ta=ln(null),bs=ln(0);function Cf(t,e){t=zn,pt(bs,t),pt(Ta,e),zn=t|e.baseLanes}function Vc(){pt(bs,zn),pt(Ta,Ta.current)}function Ur(){zn=bs.current,$t(Ta),$t(bs)}var Ae=ln(null),Ue=null;function jn(t){var e=t.alternate;pt(Lt,Lt.current&1),pt(Ae,t),Ue===null&&(e===null||Ta.current!==null||e.memoizedState!==null)&&(Ue=t)}function Kc(t){pt(Lt,Lt.current),pt(Ae,t),Ue===null&&(Ue=t)}function m0(t){t.tag===22?(pt(Lt,Lt.current),pt(Ae,t),Ue===null&&(Ue=t)):Xn(t)}function Xn(){pt(Lt,Lt.current),pt(Ae,Ae.current)}function be(t){$t(Ae),Ue===t&&(Ue=null),$t(Lt)}var Lt=ln(0);function vs(t){for(var e=t;e!==null;){if(e.tag===13){var n=e.memoizedState;if(n!==null&&(n=n.dehydrated,n===null||fr(n)||mr(n)))return e}else if(e.tag===19&&(e.memoizedProps.revealOrder==="forwards"||e.memoizedProps.revealOrder==="backwards"||e.memoizedProps.revealOrder==="unstable_legacy-backwards"||e.memoizedProps.revealOrder==="together")){if(e.flags&128)return e}else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break;for(;e.sibling===null;){if(e.return===null||e.return===t)return null;e=e.return}e.sibling.return=e.return,e=e.sibling}return null}var An=0,W=null,mt=null,Yt=null,xs=!1,va=!1,kl=!1,Cs=0,Uo=0,xa=null,_y=0;function Mt(){throw Error(w(321))}function jr(t,e){if(e===null)return!1;for(var n=0;n<e.length&&n<t.length;n++)if(!Te(t[n],e[n]))return!1;return!0}function Xr(t,e,n,l,a,o){return An=o,W=e,e.memoizedState=null,e.updateQueue=null,e.lanes=0,Q.H=t===null||t.memoizedState===null?G0:Fr,kl=!1,o=n(l,a),kl=!1,va&&(o=y0(e,n,l,a)),h0(t),o}function h0(t){Q.H=jo;var e=mt!==null&&mt.next!==null;if(An=0,Yt=mt=W=null,xs=!1,Uo=0,xa=null,e)throw Error(w(300));t===null||Ut||(t=t.dependencies,t!==null&&gs(t)&&(Ut=!0))}function y0(t,e,n,l){W=t;var a=0;do{if(va&&(xa=null),Uo=0,va=!1,25<=a)throw Error(w(301));if(a+=1,Yt=mt=null,t.updateQueue!=null){var o=t.updateQueue;o.lastEffect=null,o.events=null,o.stores=null,o.memoCache!=null&&(o.memoCache.index=0)}Q.H=$0,o=e(n,l)}while(va);return o}function fy(){var t=Q.H,e=t.useState()[0];return e=typeof e.then=="function"?Po(e):e,t=t.useState()[0],(mt!==null?mt.memoizedState:null)!==t&&(W.flags|=1024),e}function Qr(){var t=Cs!==0;return Cs=0,t}function qr(t,e,n){e.updateQueue=t.updateQueue,e.flags&=-2053,t.lanes&=~n}function Zr(t){if(xs){for(t=t.memoizedState;t!==null;){var e=t.queue;e!==null&&(e.pending=null),t=t.next}xs=!1}An=0,Yt=mt=W=null,va=!1,Uo=Cs=0,xa=null}function ne(){var t={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return Yt===null?W.memoizedState=Yt=t:Yt=Yt.next=t,Yt}function Nt(){if(mt===null){var t=W.alternate;t=t!==null?t.memoizedState:null}else t=mt.next;var e=Yt===null?W.memoizedState:Yt.next;if(e!==null)Yt=e,mt=t;else{if(t===null)throw W.alternate===null?Error(w(467)):Error(w(310));mt=t,t={memoizedState:mt.memoizedState,baseState:mt.baseState,baseQueue:mt.baseQueue,queue:mt.queue,next:null},Yt===null?W.memoizedState=Yt=t:Yt=Yt.next=t}return Yt}function Gs(){return{lastEffect:null,events:null,stores:null,memoCache:null}}function Po(t){var e=Uo;return Uo+=1,xa===null&&(xa=[]),t=c0(xa,t,e),e=W,(Yt===null?e.memoizedState:Yt.next)===null&&(e=e.alternate,Q.H=e===null||e.memoizedState===null?G0:Fr),t}function $s(t){if(t!==null&&typeof t=="object"){if(typeof t.then=="function")return Po(t);if(t.$$typeof===vn)return Wt(t)}throw Error(w(438,String(t)))}function Gr(t){var e=null,n=W.updateQueue;if(n!==null&&(e=n.memoCache),e==null){var l=W.alternate;l!==null&&(l=l.updateQueue,l!==null&&(l=l.memoCache,l!=null&&(e={data:l.data.map(function(a){return a.slice()}),index:0})))}if(e==null&&(e={data:[],index:0}),n===null&&(n=Gs(),W.updateQueue=n),n.memoCache=e,n=e.data[e.index],n===void 0)for(n=e.data[e.index]=Array(t),l=0;l<t;l++)n[l]=F2;return e.index++,n}function kn(t,e){return typeof e=="function"?e(t):e}function ts(t){var e=Nt();return $r(e,mt,t)}function $r(t,e,n){var l=t.queue;if(l===null)throw Error(w(311));l.lastRenderedReducer=n;var a=t.baseQueue,o=l.pending;if(o!==null){if(a!==null){var i=a.next;a.next=o.next,o.next=i}e.baseQueue=a=o,l.pending=null}if(o=t.baseState,a===null)t.memoizedState=o;else{e=a.next;var s=i=null,u=null,m=e,h=!1;do{var v=m.lane&-536870913;if(v!==m.lane?(at&v)===v:(An&v)===v){var g=m.revertLane;if(g===0)u!==null&&(u=u.next={lane:0,revertLane:0,gesture:null,action:m.action,hasEagerState:m.hasEagerState,eagerState:m.eagerState,next:null}),v===Ea&&(h=!0);else if((An&g)===g){m=m.next,g===Ea&&(h=!0);continue}else v={lane:0,revertLane:m.revertLane,gesture:null,action:m.action,hasEagerState:m.hasEagerState,eagerState:m.eagerState,next:null},u===null?(s=u=v,i=o):u=u.next=v,W.lanes|=g,il|=g;v=m.action,kl&&n(o,v),o=m.hasEagerState?m.eagerState:n(o,v)}else g={lane:v,revertLane:m.revertLane,gesture:m.gesture,action:m.action,hasEagerState:m.hasEagerState,eagerState:m.eagerState,next:null},u===null?(s=u=g,i=o):u=u.next=g,W.lanes|=v,il|=v;m=m.next}while(m!==null&&m!==e);if(u===null?i=o:u.next=s,!Te(o,t.memoizedState)&&(Ut=!0,h&&(n=pa,n!==null)))throw n;t.memoizedState=o,t.baseState=i,t.baseQueue=u,l.lastRenderedState=o}return a===null&&(l.lanes=0),[t.memoizedState,l.dispatch]}function oc(t){var e=Nt(),n=e.queue;if(n===null)throw Error(w(311));n.lastRenderedReducer=t;var l=n.dispatch,a=n.pending,o=e.memoizedState;if(a!==null){n.pending=null;var i=a=a.next;do o=t(o,i.action),i=i.next;while(i!==a);Te(o,e.memoizedState)||(Ut=!0),e.memoizedState=o,e.baseQueue===null&&(e.baseState=o),n.lastRenderedState=o}return[o,l]}function g0(t,e,n){var l=W,a=Nt(),o=it;if(o){if(n===void 0)throw Error(w(407));n=n()}else n=e();var i=!Te((mt||a).memoizedState,n);if(i&&(a.memoizedState=n,Ut=!0),a=a.queue,Vr(v0.bind(null,l,a,t),[t]),a.getSnapshot!==e||i||Yt!==null&&Yt.memoizedState.tag&1){if(l.flags|=2048,Aa(9,{destroy:void 0},b0.bind(null,l,a,n,e),null),gt===null)throw Error(w(349));o||An&127||p0(l,e,n)}return n}function p0(t,e,n){t.flags|=16384,t={getSnapshot:e,value:n},e=W.updateQueue,e===null?(e=Gs(),W.updateQueue=e,e.stores=[t]):(n=e.stores,n===null?e.stores=[t]:n.push(t))}function b0(t,e,n,l){e.value=n,e.getSnapshot=l,x0(e)&&C0(t)}function v0(t,e,n){return n(function(){x0(e)&&C0(t)})}function x0(t){var e=t.getSnapshot;t=t.value;try{var n=e();return!Te(t,n)}catch{return!0}}function C0(t){var e=Ol(t,2);e!==null&&de(e,t,2)}function Jc(t){var e=ne();if(typeof t=="function"){var n=t;if(t=n(),kl){qn(!0);try{n()}finally{qn(!1)}}}return e.memoizedState=e.baseState=t,e.queue={pending:null,lanes:0,dispatch:null,lastRenderedReducer:kn,lastRenderedState:t},e}function S0(t,e,n,l){return t.baseState=n,$r(t,mt,typeof l=="function"?l:kn)}function my(t,e,n,l,a){if(Ks(t))throw Error(w(485));if(t=e.action,t!==null){var o={payload:a,action:t,next:null,isTransition:!0,status:"pending",value:null,reason:null,listeners:[],then:function(i){o.listeners.push(i)}};Q.T!==null?n(!0):o.isTransition=!1,l(o),n=e.pending,n===null?(o.next=e.pending=o,w0(e,o)):(o.next=n.next,e.pending=n.next=o)}}function w0(t,e){var n=e.action,l=e.payload,a=t.state;if(e.isTransition){var o=Q.T,i={};Q.T=i;try{var s=n(a,l),u=Q.S;u!==null&&u(i,s),Sf(t,e,s)}catch(m){Wc(t,e,m)}finally{o!==null&&i.types!==null&&(o.types=i.types),Q.T=o}}else try{o=n(a,l),Sf(t,e,o)}catch(m){Wc(t,e,m)}}function Sf(t,e,n){n!==null&&typeof n=="object"&&typeof n.then=="function"?n.then(function(l){wf(t,e,l)},function(l){return Wc(t,e,l)}):wf(t,e,n)}function wf(t,e,n){e.status="fulfilled",e.value=n,E0(e),t.state=n,e=t.pending,e!==null&&(n=e.next,n===e?t.pending=null:(n=n.next,e.next=n,w0(t,n)))}function Wc(t,e,n){var l=t.pending;if(t.pending=null,l!==null){l=l.next;do e.status="rejected",e.reason=n,E0(e),e=e.next;while(e!==l)}t.action=null}function E0(t){t=t.listeners;for(var e=0;e<t.length;e++)(0,t[e])()}function T0(t,e){return e}function Ef(t,e){if(it){var n=gt.formState;if(n!==null){t:{var l=W;if(it){if(xt){e:{for(var a=xt,o=Re;a.nodeType!==8;){if(!o){a=null;break e}if(a=je(a.nextSibling),a===null){a=null;break e}}o=a.data,a=o==="F!"||o==="F"?a:null}if(a){xt=je(a.nextSibling),l=a.data==="F!";break t}}al(l)}l=!1}l&&(e=n[0])}}return n=ne(),n.memoizedState=n.baseState=e,l={pending:null,lanes:0,dispatch:null,lastRenderedReducer:T0,lastRenderedState:e},n.queue=l,n=Q0.bind(null,W,l),l.dispatch=n,l=Jc(!1),o=Ir.bind(null,W,!1,l.queue),l=ne(),a={state:e,dispatch:null,action:t,pending:null},l.queue=a,n=my.bind(null,W,a,o,n),a.dispatch=n,l.memoizedState=t,[e,n,!1]}function Tf(t){var e=Nt();return A0(e,mt,t)}function A0(t,e,n){if(e=$r(t,e,T0)[0],t=ts(kn)[0],typeof e=="object"&&e!==null&&typeof e.then=="function")try{var l=Po(e)}catch(i){throw i===Ya?Zs:i}else l=e;e=Nt();var a=e.queue,o=a.dispatch;return n!==e.memoizedState&&(W.flags|=2048,Aa(9,{destroy:void 0},hy.bind(null,a,n),null)),[l,o,t]}function hy(t,e){t.action=e}function Af(t){var e=Nt(),n=mt;if(n!==null)return A0(e,n,t);Nt(),e=e.memoizedState,n=Nt();var l=n.queue.dispatch;return n.memoizedState=t,[e,l,!1]}function Aa(t,e,n,l){return t={tag:t,create:n,deps:l,inst:e,next:null},e=W.updateQueue,e===null&&(e=Gs(),W.updateQueue=e),n=e.lastEffect,n===null?e.lastEffect=t.next=t:(l=n.next,n.next=t,t.next=l,e.lastEffect=t),t}function k0(){return Nt().memoizedState}function es(t,e,n,l){var a=ne();W.flags|=t,a.memoizedState=Aa(1|e,{destroy:void 0},n,l===void 0?null:l)}function Vs(t,e,n,l){var a=Nt();l=l===void 0?null:l;var o=a.memoizedState.inst;mt!==null&&l!==null&&jr(l,mt.memoizedState.deps)?a.memoizedState=Aa(e,o,n,l):(W.flags|=t,a.memoizedState=Aa(1|e,o,n,l))}function kf(t,e){es(8390656,8,t,e)}function Vr(t,e){Vs(2048,8,t,e)}function yy(t){W.flags|=4;var e=W.updateQueue;if(e===null)e=Gs(),W.updateQueue=e,e.events=[t];else{var n=e.events;n===null?e.events=[t]:n.push(t)}}function M0(t){var e=Nt().memoizedState;return yy({ref:e,nextImpl:t}),function(){if(ct&2)throw Error(w(440));return e.impl.apply(void 0,arguments)}}function z0(t,e){return Vs(4,2,t,e)}function L0(t,e){return Vs(4,4,t,e)}function N0(t,e){if(typeof e=="function"){t=t();var n=e(t);return function(){typeof n=="function"?n():e(null)}}if(e!=null)return t=t(),e.current=t,function(){e.current=null}}function O0(t,e,n){n=n!=null?n.concat([t]):null,Vs(4,4,N0.bind(null,e,t),n)}function Kr(){}function D0(t,e){var n=Nt();e=e===void 0?null:e;var l=n.memoizedState;return e!==null&&jr(e,l[1])?l[0]:(n.memoizedState=[t,e],t)}function B0(t,e){var n=Nt();e=e===void 0?null:e;var l=n.memoizedState;if(e!==null&&jr(e,l[1]))return l[0];if(l=t(),kl){qn(!0);try{t()}finally{qn(!1)}}return n.memoizedState=[l,e],l}function Jr(t,e,n){return n===void 0||An&1073741824&&!(at&261930)?t.memoizedState=e:(t.memoizedState=n,t=Sm(),W.lanes|=t,il|=t,n)}function Y0(t,e,n,l){return Te(n,e)?n:Ta.current!==null?(t=Jr(t,n,l),Te(t,e)||(Ut=!0),t):!(An&42)||An&1073741824&&!(at&261930)?(Ut=!0,t.memoizedState=n):(t=Sm(),W.lanes|=t,il|=t,e)}function H0(t,e,n,l,a){var o=rt.p;rt.p=o!==0&&8>o?o:8;var i=Q.T,s={};Q.T=s,Ir(t,!1,e,n);try{var u=a(),m=Q.S;if(m!==null&&m(s,u),u!==null&&typeof u=="object"&&typeof u.then=="function"){var h=dy(u,l);To(t,e,h,Ee(t))}else To(t,e,l,Ee(t))}catch(v){To(t,e,{then:function(){},status:"rejected",reason:v},Ee())}finally{rt.p=o,i!==null&&s.types!==null&&(i.types=s.types),Q.T=i}}function gy(){}function Ic(t,e,n,l){if(t.tag!==5)throw Error(w(476));var a=R0(t).queue;H0(t,a,e,vl,n===null?gy:function(){return U0(t),n(l)})}function R0(t){var e=t.memoizedState;if(e!==null)return e;e={memoizedState:vl,baseState:vl,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:kn,lastRenderedState:vl},next:null};var n={};return e.next={memoizedState:n,baseState:n,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:kn,lastRenderedState:n},next:null},t.memoizedState=e,t=t.alternate,t!==null&&(t.memoizedState=e),e}function U0(t){var e=R0(t);e.next===null&&(e=t.alternate.memoizedState),To(t,e.next.queue,{},Ee())}function Wr(){return Wt(qo)}function j0(){return Nt().memoizedState}function X0(){return Nt().memoizedState}function py(t){for(var e=t.return;e!==null;){switch(e.tag){case 24:case 3:var n=Ee();t=Wn(n);var l=In(e,t,n);l!==null&&(de(l,e,n),So(l,e,n)),e={cache:Br()},t.payload=e;return}e=e.return}}function by(t,e,n){var l=Ee();n={lane:l,revertLane:0,gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null},Ks(t)?q0(e,n):(n=Lr(t,e,n,l),n!==null&&(de(n,t,l),Z0(n,e,l)))}function Q0(t,e,n){var l=Ee();To(t,e,n,l)}function To(t,e,n,l){var a={lane:l,revertLane:0,gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null};if(Ks(t))q0(e,a);else{var o=t.alternate;if(t.lanes===0&&(o===null||o.lanes===0)&&(o=e.lastRenderedReducer,o!==null))try{var i=e.lastRenderedState,s=o(i,n);if(a.hasEagerState=!0,a.eagerState=s,Te(s,i))return qs(t,e,a,0),gt===null&&Qs(),!1}catch{}finally{}if(n=Lr(t,e,a,l),n!==null)return de(n,t,l),Z0(n,e,l),!0}return!1}function Ir(t,e,n,l){if(l={lane:2,revertLane:id(),gesture:null,action:l,hasEagerState:!1,eagerState:null,next:null},Ks(t)){if(e)throw Error(w(479))}else e=Lr(t,n,l,2),e!==null&&de(e,t,2)}function Ks(t){var e=t.alternate;return t===W||e!==null&&e===W}function q0(t,e){va=xs=!0;var n=t.pending;n===null?e.next=e:(e.next=n.next,n.next=e),t.pending=e}function Z0(t,e,n){if(n&4194048){var l=e.lanes;l&=t.pendingLanes,n|=l,e.lanes=n,M1(t,n)}}var jo={readContext:Wt,use:$s,useCallback:Mt,useContext:Mt,useEffect:Mt,useImperativeHandle:Mt,useLayoutEffect:Mt,useInsertionEffect:Mt,useMemo:Mt,useReducer:Mt,useRef:Mt,useState:Mt,useDebugValue:Mt,useDeferredValue:Mt,useTransition:Mt,useSyncExternalStore:Mt,useId:Mt,useHostTransitionStatus:Mt,useFormState:Mt,useActionState:Mt,useOptimistic:Mt,useMemoCache:Mt,useCacheRefresh:Mt};jo.useEffectEvent=Mt;var G0={readContext:Wt,use:$s,useCallback:function(t,e){return ne().memoizedState=[t,e===void 0?null:e],t},useContext:Wt,useEffect:kf,useImperativeHandle:function(t,e,n){n=n!=null?n.concat([t]):null,es(4194308,4,N0.bind(null,e,t),n)},useLayoutEffect:function(t,e){return es(4194308,4,t,e)},useInsertionEffect:function(t,e){es(4,2,t,e)},useMemo:function(t,e){var n=ne();e=e===void 0?null:e;var l=t();if(kl){qn(!0);try{t()}finally{qn(!1)}}return n.memoizedState=[l,e],l},useReducer:function(t,e,n){var l=ne();if(n!==void 0){var a=n(e);if(kl){qn(!0);try{n(e)}finally{qn(!1)}}}else a=e;return l.memoizedState=l.baseState=a,t={pending:null,lanes:0,dispatch:null,lastRenderedReducer:t,lastRenderedState:a},l.queue=t,t=t.dispatch=by.bind(null,W,t),[l.memoizedState,t]},useRef:function(t){var e=ne();return t={current:t},e.memoizedState=t},useState:function(t){t=Jc(t);var e=t.queue,n=Q0.bind(null,W,e);return e.dispatch=n,[t.memoizedState,n]},useDebugValue:Kr,useDeferredValue:function(t,e){var n=ne();return Jr(n,t,e)},useTransition:function(){var t=Jc(!1);return t=H0.bind(null,W,t.queue,!0,!1),ne().memoizedState=t,[!1,t]},useSyncExternalStore:function(t,e,n){var l=W,a=ne();if(it){if(n===void 0)throw Error(w(407));n=n()}else{if(n=e(),gt===null)throw Error(w(349));at&127||p0(l,e,n)}a.memoizedState=n;var o={value:n,getSnapshot:e};return a.queue=o,kf(v0.bind(null,l,o,t),[t]),l.flags|=2048,Aa(9,{destroy:void 0},b0.bind(null,l,o,n,e),null),n},useId:function(){var t=ne(),e=gt.identifierPrefix;if(it){var n=tn,l=Pe;n=(l&~(1<<32-we(l)-1)).toString(32)+n,e="_"+e+"R_"+n,n=Cs++,0<n&&(e+="H"+n.toString(32)),e+="_"}else n=_y++,e="_"+e+"r_"+n.toString(32)+"_";return t.memoizedState=e},useHostTransitionStatus:Wr,useFormState:Ef,useActionState:Ef,useOptimistic:function(t){var e=ne();e.memoizedState=e.baseState=t;var n={pending:null,lanes:0,dispatch:null,lastRenderedReducer:null,lastRenderedState:null};return e.queue=n,e=Ir.bind(null,W,!0,n),n.dispatch=e,[t,e]},useMemoCache:Gr,useCacheRefresh:function(){return ne().memoizedState=py.bind(null,W)},useEffectEvent:function(t){var e=ne(),n={impl:t};return e.memoizedState=n,function(){if(ct&2)throw Error(w(440));return n.impl.apply(void 0,arguments)}}},Fr={readContext:Wt,use:$s,useCallback:D0,useContext:Wt,useEffect:Vr,useImperativeHandle:O0,useInsertionEffect:z0,useLayoutEffect:L0,useMemo:B0,useReducer:ts,useRef:k0,useState:function(){return ts(kn)},useDebugValue:Kr,useDeferredValue:function(t,e){var n=Nt();return Y0(n,mt.memoizedState,t,e)},useTransition:function(){var t=ts(kn)[0],e=Nt().memoizedState;return[typeof t=="boolean"?t:Po(t),e]},useSyncExternalStore:g0,useId:j0,useHostTransitionStatus:Wr,useFormState:Tf,useActionState:Tf,useOptimistic:function(t,e){var n=Nt();return S0(n,mt,t,e)},useMemoCache:Gr,useCacheRefresh:X0};Fr.useEffectEvent=M0;var $0={readContext:Wt,use:$s,useCallback:D0,useContext:Wt,useEffect:Vr,useImperativeHandle:O0,useInsertionEffect:z0,useLayoutEffect:L0,useMemo:B0,useReducer:oc,useRef:k0,useState:function(){return oc(kn)},useDebugValue:Kr,useDeferredValue:function(t,e){var n=Nt();return mt===null?Jr(n,t,e):Y0(n,mt.memoizedState,t,e)},useTransition:function(){var t=oc(kn)[0],e=Nt().memoizedState;return[typeof t=="boolean"?t:Po(t),e]},useSyncExternalStore:g0,useId:j0,useHostTransitionStatus:Wr,useFormState:Af,useActionState:Af,useOptimistic:function(t,e){var n=Nt();return mt!==null?S0(n,mt,t,e):(n.baseState=t,[t,n.queue.dispatch])},useMemoCache:Gr,useCacheRefresh:X0};$0.useEffectEvent=M0;function ic(t,e,n,l){e=t.memoizedState,n=n(l,e),n=n==null?e:Ct({},e,n),t.memoizedState=n,t.lanes===0&&(t.updateQueue.baseState=n)}var Fc={enqueueSetState:function(t,e,n){t=t._reactInternals;var l=Ee(),a=Wn(l);a.payload=e,n!=null&&(a.callback=n),e=In(t,a,l),e!==null&&(de(e,t,l),So(e,t,l))},enqueueReplaceState:function(t,e,n){t=t._reactInternals;var l=Ee(),a=Wn(l);a.tag=1,a.payload=e,n!=null&&(a.callback=n),e=In(t,a,l),e!==null&&(de(e,t,l),So(e,t,l))},enqueueForceUpdate:function(t,e){t=t._reactInternals;var n=Ee(),l=Wn(n);l.tag=2,e!=null&&(l.callback=e),e=In(t,l,n),e!==null&&(de(e,t,n),So(e,t,n))}};function Mf(t,e,n,l,a,o,i){return t=t.stateNode,typeof t.shouldComponentUpdate=="function"?t.shouldComponentUpdate(l,o,i):e.prototype&&e.prototype.isPureReactComponent?!Bo(n,l)||!Bo(a,o):!0}function zf(t,e,n,l){t=e.state,typeof e.componentWillReceiveProps=="function"&&e.componentWillReceiveProps(n,l),typeof e.UNSAFE_componentWillReceiveProps=="function"&&e.UNSAFE_componentWillReceiveProps(n,l),e.state!==t&&Fc.enqueueReplaceState(e,e.state,null)}function Ml(t,e){var n=e;if("ref"in e){n={};for(var l in e)l!=="ref"&&(n[l]=e[l])}if(t=t.defaultProps){n===e&&(n=Ct({},n));for(var a in t)n[a]===void 0&&(n[a]=t[a])}return n}function V0(t){ms(t)}function K0(t){console.error(t)}function J0(t){ms(t)}function Ss(t,e){try{var n=t.onUncaughtError;n(e.value,{componentStack:e.stack})}catch(l){setTimeout(function(){throw l})}}function Lf(t,e,n){try{var l=t.onCaughtError;l(n.value,{componentStack:n.stack,errorBoundary:e.tag===1?e.stateNode:null})}catch(a){setTimeout(function(){throw a})}}function Pc(t,e,n){return n=Wn(n),n.tag=3,n.payload={element:null},n.callback=function(){Ss(t,e)},n}function W0(t){return t=Wn(t),t.tag=3,t}function I0(t,e,n,l){var a=n.type.getDerivedStateFromError;if(typeof a=="function"){var o=l.value;t.payload=function(){return a(o)},t.callback=function(){Lf(e,n,l)}}var i=n.stateNode;i!==null&&typeof i.componentDidCatch=="function"&&(t.callback=function(){Lf(e,n,l),typeof a!="function"&&(Fn===null?Fn=new Set([this]):Fn.add(this));var s=l.stack;this.componentDidCatch(l.value,{componentStack:s!==null?s:""})})}function vy(t,e,n,l,a){if(n.flags|=32768,l!==null&&typeof l=="object"&&typeof l.then=="function"){if(e=n.alternate,e!==null&&Ba(e,n,a,!0),n=Ae.current,n!==null){switch(n.tag){case 31:case 13:return Ue===null?ks():n.alternate===null&&zt===0&&(zt=3),n.flags&=-257,n.flags|=65536,n.lanes=a,l===ps?n.flags|=16384:(e=n.updateQueue,e===null?n.updateQueue=new Set([l]):e.add(l),gc(t,l,a)),!1;case 22:return n.flags|=65536,l===ps?n.flags|=16384:(e=n.updateQueue,e===null?(e={transitions:null,markerInstances:null,retryQueue:new Set([l])},n.updateQueue=e):(n=e.retryQueue,n===null?e.retryQueue=new Set([l]):n.add(l)),gc(t,l,a)),!1}throw Error(w(435,n.tag))}return gc(t,l,a),ks(),!1}if(it)return e=Ae.current,e!==null?(!(e.flags&65536)&&(e.flags|=256),e.flags|=65536,e.lanes=a,l!==jc&&(t=Error(w(422),{cause:l}),Ho(He(t,n)))):(l!==jc&&(e=Error(w(423),{cause:l}),Ho(He(e,n))),t=t.current.alternate,t.flags|=65536,a&=-a,t.lanes|=a,l=He(l,n),a=Pc(t.stateNode,l,a),ac(t,a),zt!==4&&(zt=2)),!1;var o=Error(w(520),{cause:l});if(o=He(o,n),Mo===null?Mo=[o]:Mo.push(o),zt!==4&&(zt=2),e===null)return!0;l=He(l,n),n=e;do{switch(n.tag){case 3:return n.flags|=65536,t=a&-a,n.lanes|=t,t=Pc(n.stateNode,l,t),ac(n,t),!1;case 1:if(e=n.type,o=n.stateNode,(n.flags&128)===0&&(typeof e.getDerivedStateFromError=="function"||o!==null&&typeof o.componentDidCatch=="function"&&(Fn===null||!Fn.has(o))))return n.flags|=65536,a&=-a,n.lanes|=a,a=W0(a),I0(a,t,n,l),ac(n,a),!1}n=n.return}while(n!==null);return!1}var Pr=Error(w(461)),Ut=!1;function Vt(t,e,n,l){e.child=t===null?d0(e,null,n,l):Al(e,t.child,n,l)}function Nf(t,e,n,l,a){n=n.render;var o=e.ref;if("ref"in l){var i={};for(var s in l)s!=="ref"&&(i[s]=l[s])}else i=l;return Tl(e),l=Xr(t,e,n,i,o,a),s=Qr(),t!==null&&!Ut?(qr(t,e,a),Mn(t,e,a)):(it&&s&&Or(e),e.flags|=1,Vt(t,e,l,a),e.child)}function Of(t,e,n,l,a){if(t===null){var o=n.type;return typeof o=="function"&&!Nr(o)&&o.defaultProps===void 0&&n.compare===null?(e.tag=15,e.type=o,F0(t,e,o,l,a)):(t=Fi(n.type,null,l,e,e.mode,a),t.ref=e.ref,t.return=e,e.child=t)}if(o=t.child,!td(t,a)){var i=o.memoizedProps;if(n=n.compare,n=n!==null?n:Bo,n(i,l)&&t.ref===e.ref)return Mn(t,e,a)}return e.flags|=1,t=Sn(o,l),t.ref=e.ref,t.return=e,e.child=t}function F0(t,e,n,l,a){if(t!==null){var o=t.memoizedProps;if(Bo(o,l)&&t.ref===e.ref)if(Ut=!1,e.pendingProps=l=o,td(t,a))t.flags&131072&&(Ut=!0);else return e.lanes=t.lanes,Mn(t,e,a)}return tr(t,e,n,l,a)}function P0(t,e,n,l){var a=l.children,o=t!==null?t.memoizedState:null;if(t===null&&e.stateNode===null&&(e.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),l.mode==="hidden"){if(e.flags&128){if(o=o!==null?o.baseLanes|n:n,t!==null){for(l=e.child=t.child,a=0;l!==null;)a=a|l.lanes|l.childLanes,l=l.sibling;l=a&~o}else l=0,e.child=null;return Df(t,e,o,n,l)}if(n&536870912)e.memoizedState={baseLanes:0,cachePool:null},t!==null&&Pi(e,o!==null?o.cachePool:null),o!==null?Cf(e,o):Vc(),m0(e);else return l=e.lanes=536870912,Df(t,e,o!==null?o.baseLanes|n:n,n,l)}else o!==null?(Pi(e,o.cachePool),Cf(e,o),Xn(e),e.memoizedState=null):(t!==null&&Pi(e,null),Vc(),Xn(e));return Vt(t,e,a,n),e.child}function go(t,e){return t!==null&&t.tag===22||e.stateNode!==null||(e.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),e.sibling}function Df(t,e,n,l,a){var o=Yr();return o=o===null?null:{parent:Rt._currentValue,pool:o},e.memoizedState={baseLanes:n,cachePool:o},t!==null&&Pi(e,null),Vc(),m0(e),t!==null&&Ba(t,e,l,!0),e.childLanes=a,null}function ns(t,e){return e=ws({mode:e.mode,children:e.children},t.mode),e.ref=t.ref,t.child=e,e.return=t,e}function Bf(t,e,n){return Al(e,t.child,null,n),t=ns(e,e.pendingProps),t.flags|=2,be(e),e.memoizedState=null,t}function xy(t,e,n){var l=e.pendingProps,a=(e.flags&128)!==0;if(e.flags&=-129,t===null){if(it){if(l.mode==="hidden")return t=ns(e,l),e.lanes=536870912,go(null,t);if(Kc(e),(t=xt)?(t=Gm(t,Re),t=t!==null&&t.data==="&"?t:null,t!==null&&(e.memoizedState={dehydrated:t,treeContext:ll!==null?{id:Pe,overflow:tn}:null,retryLane:536870912,hydrationErrors:null},n=a0(t),n.return=e,e.child=n,Jt=e,xt=null)):t=null,t===null)throw al(e);return e.lanes=536870912,null}return ns(e,l)}var o=t.memoizedState;if(o!==null){var i=o.dehydrated;if(Kc(e),a)if(e.flags&256)e.flags&=-257,e=Bf(t,e,n);else if(e.memoizedState!==null)e.child=t.child,e.flags|=128,e=null;else throw Error(w(558));else if(Ut||Ba(t,e,n,!1),a=(n&t.childLanes)!==0,Ut||a){if(l=gt,l!==null&&(i=z1(l,n),i!==0&&i!==o.retryLane))throw o.retryLane=i,Ol(t,i),de(l,t,i),Pr;ks(),e=Bf(t,e,n)}else t=o.treeContext,xt=je(i.nextSibling),Jt=e,it=!0,Jn=null,Re=!1,t!==null&&i0(e,t),e=ns(e,l),e.flags|=4096;return e}return t=Sn(t.child,{mode:l.mode,children:l.children}),t.ref=e.ref,e.child=t,t.return=e,t}function ls(t,e){var n=e.ref;if(n===null)t!==null&&t.ref!==null&&(e.flags|=4194816);else{if(typeof n!="function"&&typeof n!="object")throw Error(w(284));(t===null||t.ref!==n)&&(e.flags|=4194816)}}function tr(t,e,n,l,a){return Tl(e),n=Xr(t,e,n,l,void 0,a),l=Qr(),t!==null&&!Ut?(qr(t,e,a),Mn(t,e,a)):(it&&l&&Or(e),e.flags|=1,Vt(t,e,n,a),e.child)}function Yf(t,e,n,l,a,o){return Tl(e),e.updateQueue=null,n=y0(e,l,n,a),h0(t),l=Qr(),t!==null&&!Ut?(qr(t,e,o),Mn(t,e,o)):(it&&l&&Or(e),e.flags|=1,Vt(t,e,n,o),e.child)}function Hf(t,e,n,l,a){if(Tl(e),e.stateNode===null){var o=da,i=n.contextType;typeof i=="object"&&i!==null&&(o=Wt(i)),o=new n(l,o),e.memoizedState=o.state!==null&&o.state!==void 0?o.state:null,o.updater=Fc,e.stateNode=o,o._reactInternals=e,o=e.stateNode,o.props=l,o.state=e.memoizedState,o.refs={},Rr(e),i=n.contextType,o.context=typeof i=="object"&&i!==null?Wt(i):da,o.state=e.memoizedState,i=n.getDerivedStateFromProps,typeof i=="function"&&(ic(e,n,i,l),o.state=e.memoizedState),typeof n.getDerivedStateFromProps=="function"||typeof o.getSnapshotBeforeUpdate=="function"||typeof o.UNSAFE_componentWillMount!="function"&&typeof o.componentWillMount!="function"||(i=o.state,typeof o.componentWillMount=="function"&&o.componentWillMount(),typeof o.UNSAFE_componentWillMount=="function"&&o.UNSAFE_componentWillMount(),i!==o.state&&Fc.enqueueReplaceState(o,o.state,null),Eo(e,l,o,a),wo(),o.state=e.memoizedState),typeof o.componentDidMount=="function"&&(e.flags|=4194308),l=!0}else if(t===null){o=e.stateNode;var s=e.memoizedProps,u=Ml(n,s);o.props=u;var m=o.context,h=n.contextType;i=da,typeof h=="object"&&h!==null&&(i=Wt(h));var v=n.getDerivedStateFromProps;h=typeof v=="function"||typeof o.getSnapshotBeforeUpdate=="function",s=e.pendingProps!==s,h||typeof o.UNSAFE_componentWillReceiveProps!="function"&&typeof o.componentWillReceiveProps!="function"||(s||m!==i)&&zf(e,o,l,i),Rn=!1;var g=e.memoizedState;o.state=g,Eo(e,l,o,a),wo(),m=e.memoizedState,s||g!==m||Rn?(typeof v=="function"&&(ic(e,n,v,l),m=e.memoizedState),(u=Rn||Mf(e,n,u,l,g,m,i))?(h||typeof o.UNSAFE_componentWillMount!="function"&&typeof o.componentWillMount!="function"||(typeof o.componentWillMount=="function"&&o.componentWillMount(),typeof o.UNSAFE_componentWillMount=="function"&&o.UNSAFE_componentWillMount()),typeof o.componentDidMount=="function"&&(e.flags|=4194308)):(typeof o.componentDidMount=="function"&&(e.flags|=4194308),e.memoizedProps=l,e.memoizedState=m),o.props=l,o.state=m,o.context=i,l=u):(typeof o.componentDidMount=="function"&&(e.flags|=4194308),l=!1)}else{o=e.stateNode,Gc(t,e),i=e.memoizedProps,h=Ml(n,i),o.props=h,v=e.pendingProps,g=o.context,m=n.contextType,u=da,typeof m=="object"&&m!==null&&(u=Wt(m)),s=n.getDerivedStateFromProps,(m=typeof s=="function"||typeof o.getSnapshotBeforeUpdate=="function")||typeof o.UNSAFE_componentWillReceiveProps!="function"&&typeof o.componentWillReceiveProps!="function"||(i!==v||g!==u)&&zf(e,o,l,u),Rn=!1,g=e.memoizedState,o.state=g,Eo(e,l,o,a),wo();var b=e.memoizedState;i!==v||g!==b||Rn||t!==null&&t.dependencies!==null&&gs(t.dependencies)?(typeof s=="function"&&(ic(e,n,s,l),b=e.memoizedState),(h=Rn||Mf(e,n,h,l,g,b,u)||t!==null&&t.dependencies!==null&&gs(t.dependencies))?(m||typeof o.UNSAFE_componentWillUpdate!="function"&&typeof o.componentWillUpdate!="function"||(typeof o.componentWillUpdate=="function"&&o.componentWillUpdate(l,b,u),typeof o.UNSAFE_componentWillUpdate=="function"&&o.UNSAFE_componentWillUpdate(l,b,u)),typeof o.componentDidUpdate=="function"&&(e.flags|=4),typeof o.getSnapshotBeforeUpdate=="function"&&(e.flags|=1024)):(typeof o.componentDidUpdate!="function"||i===t.memoizedProps&&g===t.memoizedState||(e.flags|=4),typeof o.getSnapshotBeforeUpdate!="function"||i===t.memoizedProps&&g===t.memoizedState||(e.flags|=1024),e.memoizedProps=l,e.memoizedState=b),o.props=l,o.state=b,o.context=u,l=h):(typeof o.componentDidUpdate!="function"||i===t.memoizedProps&&g===t.memoizedState||(e.flags|=4),typeof o.getSnapshotBeforeUpdate!="function"||i===t.memoizedProps&&g===t.memoizedState||(e.flags|=1024),l=!1)}return o=l,ls(t,e),l=(e.flags&128)!==0,o||l?(o=e.stateNode,n=l&&typeof n.getDerivedStateFromError!="function"?null:o.render(),e.flags|=1,t!==null&&l?(e.child=Al(e,t.child,null,a),e.child=Al(e,null,n,a)):Vt(t,e,n,a),e.memoizedState=o.state,t=e.child):t=Mn(t,e,a),t}function Rf(t,e,n,l){return El(),e.flags|=256,Vt(t,e,n,l),e.child}var sc={dehydrated:null,treeContext:null,retryLane:0,hydrationErrors:null};function uc(t){return{baseLanes:t,cachePool:u0()}}function cc(t,e,n){return t=t!==null?t.childLanes&~n:0,e&&(t|=xe),t}function tm(t,e,n){var l=e.pendingProps,a=!1,o=(e.flags&128)!==0,i;if((i=o)||(i=t!==null&&t.memoizedState===null?!1:(Lt.current&2)!==0),i&&(a=!0,e.flags&=-129),i=(e.flags&32)!==0,e.flags&=-33,t===null){if(it){if(a?jn(e):Xn(e),(t=xt)?(t=Gm(t,Re),t=t!==null&&t.data!=="&"?t:null,t!==null&&(e.memoizedState={dehydrated:t,treeContext:ll!==null?{id:Pe,overflow:tn}:null,retryLane:536870912,hydrationErrors:null},n=a0(t),n.return=e,e.child=n,Jt=e,xt=null)):t=null,t===null)throw al(e);return mr(t)?e.lanes=32:e.lanes=536870912,null}var s=l.children;return l=l.fallback,a?(Xn(e),a=e.mode,s=ws({mode:"hidden",children:s},a),l=xl(l,a,n,null),s.return=e,l.return=e,s.sibling=l,e.child=s,l=e.child,l.memoizedState=uc(n),l.childLanes=cc(t,i,n),e.memoizedState=sc,go(null,l)):(jn(e),er(e,s))}var u=t.memoizedState;if(u!==null&&(s=u.dehydrated,s!==null)){if(o)e.flags&256?(jn(e),e.flags&=-257,e=rc(t,e,n)):e.memoizedState!==null?(Xn(e),e.child=t.child,e.flags|=128,e=null):(Xn(e),s=l.fallback,a=e.mode,l=ws({mode:"visible",children:l.children},a),s=xl(s,a,n,null),s.flags|=2,l.return=e,s.return=e,l.sibling=s,e.child=l,Al(e,t.child,null,n),l=e.child,l.memoizedState=uc(n),l.childLanes=cc(t,i,n),e.memoizedState=sc,e=go(null,l));else if(jn(e),mr(s)){if(i=s.nextSibling&&s.nextSibling.dataset,i)var m=i.dgst;i=m,l=Error(w(419)),l.stack="",l.digest=i,Ho({value:l,source:null,stack:null}),e=rc(t,e,n)}else if(Ut||Ba(t,e,n,!1),i=(n&t.childLanes)!==0,Ut||i){if(i=gt,i!==null&&(l=z1(i,n),l!==0&&l!==u.retryLane))throw u.retryLane=l,Ol(t,l),de(i,t,l),Pr;fr(s)||ks(),e=rc(t,e,n)}else fr(s)?(e.flags|=192,e.child=t.child,e=null):(t=u.treeContext,xt=je(s.nextSibling),Jt=e,it=!0,Jn=null,Re=!1,t!==null&&i0(e,t),e=er(e,l.children),e.flags|=4096);return e}return a?(Xn(e),s=l.fallback,a=e.mode,u=t.child,m=u.sibling,l=Sn(u,{mode:"hidden",children:l.children}),l.subtreeFlags=u.subtreeFlags&65011712,m!==null?s=Sn(m,s):(s=xl(s,a,n,null),s.flags|=2),s.return=e,l.return=e,l.sibling=s,e.child=l,go(null,l),l=e.child,s=t.child.memoizedState,s===null?s=uc(n):(a=s.cachePool,a!==null?(u=Rt._currentValue,a=a.parent!==u?{parent:u,pool:u}:a):a=u0(),s={baseLanes:s.baseLanes|n,cachePool:a}),l.memoizedState=s,l.childLanes=cc(t,i,n),e.memoizedState=sc,go(t.child,l)):(jn(e),n=t.child,t=n.sibling,n=Sn(n,{mode:"visible",children:l.children}),n.return=e,n.sibling=null,t!==null&&(i=e.deletions,i===null?(e.deletions=[t],e.flags|=16):i.push(t)),e.child=n,e.memoizedState=null,n)}function er(t,e){return e=ws({mode:"visible",children:e},t.mode),e.return=t,t.child=e}function ws(t,e){return t=ve(22,t,null,e),t.lanes=0,t}function rc(t,e,n){return Al(e,t.child,null,n),t=er(e,e.pendingProps.children),t.flags|=2,e.memoizedState=null,t}function Uf(t,e,n){t.lanes|=e;var l=t.alternate;l!==null&&(l.lanes|=e),Qc(t.return,e,n)}function dc(t,e,n,l,a,o){var i=t.memoizedState;i===null?t.memoizedState={isBackwards:e,rendering:null,renderingStartTime:0,last:l,tail:n,tailMode:a,treeForkCount:o}:(i.isBackwards=e,i.rendering=null,i.renderingStartTime=0,i.last=l,i.tail=n,i.tailMode=a,i.treeForkCount=o)}function em(t,e,n){var l=e.pendingProps,a=l.revealOrder,o=l.tail;l=l.children;var i=Lt.current,s=(i&2)!==0;if(s?(i=i&1|2,e.flags|=128):i&=1,pt(Lt,i),Vt(t,e,l,n),l=it?Yo:0,!s&&t!==null&&t.flags&128)t:for(t=e.child;t!==null;){if(t.tag===13)t.memoizedState!==null&&Uf(t,n,e);else if(t.tag===19)Uf(t,n,e);else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break t;for(;t.sibling===null;){if(t.return===null||t.return===e)break t;t=t.return}t.sibling.return=t.return,t=t.sibling}switch(a){case"forwards":for(n=e.child,a=null;n!==null;)t=n.alternate,t!==null&&vs(t)===null&&(a=n),n=n.sibling;n=a,n===null?(a=e.child,e.child=null):(a=n.sibling,n.sibling=null),dc(e,!1,a,n,o,l);break;case"backwards":case"unstable_legacy-backwards":for(n=null,a=e.child,e.child=null;a!==null;){if(t=a.alternate,t!==null&&vs(t)===null){e.child=a;break}t=a.sibling,a.sibling=n,n=a,a=t}dc(e,!0,n,null,o,l);break;case"together":dc(e,!1,null,null,void 0,l);break;default:e.memoizedState=null}return e.child}function Mn(t,e,n){if(t!==null&&(e.dependencies=t.dependencies),il|=e.lanes,!(n&e.childLanes))if(t!==null){if(Ba(t,e,n,!1),(n&e.childLanes)===0)return null}else return null;if(t!==null&&e.child!==t.child)throw Error(w(153));if(e.child!==null){for(t=e.child,n=Sn(t,t.pendingProps),e.child=n,n.return=e;t.sibling!==null;)t=t.sibling,n=n.sibling=Sn(t,t.pendingProps),n.return=e;n.sibling=null}return e.child}function td(t,e){return t.lanes&e?!0:(t=t.dependencies,!!(t!==null&&gs(t)))}function Cy(t,e,n){switch(e.tag){case 3:rs(e,e.stateNode.containerInfo),Un(e,Rt,t.memoizedState.cache),El();break;case 27:case 5:Mc(e);break;case 4:rs(e,e.stateNode.containerInfo);break;case 10:Un(e,e.type,e.memoizedProps.value);break;case 31:if(e.memoizedState!==null)return e.flags|=128,Kc(e),null;break;case 13:var l=e.memoizedState;if(l!==null)return l.dehydrated!==null?(jn(e),e.flags|=128,null):n&e.child.childLanes?tm(t,e,n):(jn(e),t=Mn(t,e,n),t!==null?t.sibling:null);jn(e);break;case 19:var a=(t.flags&128)!==0;if(l=(n&e.childLanes)!==0,l||(Ba(t,e,n,!1),l=(n&e.childLanes)!==0),a){if(l)return em(t,e,n);e.flags|=128}if(a=e.memoizedState,a!==null&&(a.rendering=null,a.tail=null,a.lastEffect=null),pt(Lt,Lt.current),l)break;return null;case 22:return e.lanes=0,P0(t,e,n,e.pendingProps);case 24:Un(e,Rt,t.memoizedState.cache)}return Mn(t,e,n)}function nm(t,e,n){if(t!==null)if(t.memoizedProps!==e.pendingProps)Ut=!0;else{if(!td(t,n)&&!(e.flags&128))return Ut=!1,Cy(t,e,n);Ut=!!(t.flags&131072)}else Ut=!1,it&&e.flags&1048576&&o0(e,Yo,e.index);switch(e.lanes=0,e.tag){case 16:t:{var l=e.pendingProps;if(t=pl(e.elementType),e.type=t,typeof t=="function")Nr(t)?(l=Ml(t,l),e.tag=1,e=Hf(null,e,t,l,n)):(e.tag=0,e=tr(null,e,t,l,n));else{if(t!=null){var a=t.$$typeof;if(a===pr){e.tag=11,e=Nf(null,e,t,l,n);break t}else if(a===br){e.tag=14,e=Of(null,e,t,l,n);break t}}throw e=Ac(t)||t,Error(w(306,e,""))}}return e;case 0:return tr(t,e,e.type,e.pendingProps,n);case 1:return l=e.type,a=Ml(l,e.pendingProps),Hf(t,e,l,a,n);case 3:t:{if(rs(e,e.stateNode.containerInfo),t===null)throw Error(w(387));l=e.pendingProps;var o=e.memoizedState;a=o.element,Gc(t,e),Eo(e,l,null,n);var i=e.memoizedState;if(l=i.cache,Un(e,Rt,l),l!==o.cache&&qc(e,[Rt],n,!0),wo(),l=i.element,o.isDehydrated)if(o={element:l,isDehydrated:!1,cache:i.cache},e.updateQueue.baseState=o,e.memoizedState=o,e.flags&256){e=Rf(t,e,l,n);break t}else if(l!==a){a=He(Error(w(424)),e),Ho(a),e=Rf(t,e,l,n);break t}else{switch(t=e.stateNode.containerInfo,t.nodeType){case 9:t=t.body;break;default:t=t.nodeName==="HTML"?t.ownerDocument.body:t}for(xt=je(t.firstChild),Jt=e,it=!0,Jn=null,Re=!0,n=d0(e,null,l,n),e.child=n;n;)n.flags=n.flags&-3|4096,n=n.sibling}else{if(El(),l===a){e=Mn(t,e,n);break t}Vt(t,e,l,n)}e=e.child}return e;case 26:return ls(t,e),t===null?(n=s1(e.type,null,e.pendingProps,null))?e.memoizedState=n:it||(n=e.type,t=e.pendingProps,l=Ns(Kn.current).createElement(n),l[Kt]=e,l[_e]=t,It(l,n,t),Gt(l),e.stateNode=l):e.memoizedState=s1(e.type,t.memoizedProps,e.pendingProps,t.memoizedState),null;case 27:return Mc(e),t===null&&it&&(l=e.stateNode=$m(e.type,e.pendingProps,Kn.current),Jt=e,Re=!0,a=xt,ul(e.type)?(hr=a,xt=je(l.firstChild)):xt=a),Vt(t,e,e.pendingProps.children,n),ls(t,e),t===null&&(e.flags|=4194304),e.child;case 5:return t===null&&it&&((a=l=xt)&&(l=Wy(l,e.type,e.pendingProps,Re),l!==null?(e.stateNode=l,Jt=e,xt=je(l.firstChild),Re=!1,a=!0):a=!1),a||al(e)),Mc(e),a=e.type,o=e.pendingProps,i=t!==null?t.memoizedProps:null,l=o.children,dr(a,o)?l=null:i!==null&&dr(a,i)&&(e.flags|=32),e.memoizedState!==null&&(a=Xr(t,e,fy,null,null,n),qo._currentValue=a),ls(t,e),Vt(t,e,l,n),e.child;case 6:return t===null&&it&&((t=n=xt)&&(n=Iy(n,e.pendingProps,Re),n!==null?(e.stateNode=n,Jt=e,xt=null,t=!0):t=!1),t||al(e)),null;case 13:return tm(t,e,n);case 4:return rs(e,e.stateNode.containerInfo),l=e.pendingProps,t===null?e.child=Al(e,null,l,n):Vt(t,e,l,n),e.child;case 11:return Nf(t,e,e.type,e.pendingProps,n);case 7:return Vt(t,e,e.pendingProps,n),e.child;case 8:return Vt(t,e,e.pendingProps.children,n),e.child;case 12:return Vt(t,e,e.pendingProps.children,n),e.child;case 10:return l=e.pendingProps,Un(e,e.type,l.value),Vt(t,e,l.children,n),e.child;case 9:return a=e.type._context,l=e.pendingProps.children,Tl(e),a=Wt(a),l=l(a),e.flags|=1,Vt(t,e,l,n),e.child;case 14:return Of(t,e,e.type,e.pendingProps,n);case 15:return F0(t,e,e.type,e.pendingProps,n);case 19:return em(t,e,n);case 31:return xy(t,e,n);case 22:return P0(t,e,n,e.pendingProps);case 24:return Tl(e),l=Wt(Rt),t===null?(a=Yr(),a===null&&(a=gt,o=Br(),a.pooledCache=o,o.refCount++,o!==null&&(a.pooledCacheLanes|=n),a=o),e.memoizedState={parent:l,cache:a},Rr(e),Un(e,Rt,a)):(t.lanes&n&&(Gc(t,e),Eo(e,null,null,n),wo()),a=t.memoizedState,o=e.memoizedState,a.parent!==l?(a={parent:l,cache:l},e.memoizedState=a,e.lanes===0&&(e.memoizedState=e.updateQueue.baseState=a),Un(e,Rt,l)):(l=o.cache,Un(e,Rt,l),l!==a.cache&&qc(e,[Rt],n,!0))),Vt(t,e,e.pendingProps.children,n),e.child;case 29:throw e.pendingProps}throw Error(w(156,e.tag))}function mn(t){t.flags|=4}function _c(t,e,n,l,a){if((e=(t.mode&32)!==0)&&(e=!1),e){if(t.flags|=16777216,(a&335544128)===a)if(t.stateNode.complete)t.flags|=8192;else if(Tm())t.flags|=8192;else throw Sl=ps,Hr}else t.flags&=-16777217}function jf(t,e){if(e.type!=="stylesheet"||e.state.loading&4)t.flags&=-16777217;else if(t.flags|=16777216,!Jm(e))if(Tm())t.flags|=8192;else throw Sl=ps,Hr}function Xi(t,e){e!==null&&(t.flags|=4),t.flags&16384&&(e=t.tag!==22?A1():536870912,t.lanes|=e,ka|=e)}function co(t,e){if(!it)switch(t.tailMode){case"hidden":e=t.tail;for(var n=null;e!==null;)e.alternate!==null&&(n=e),e=e.sibling;n===null?t.tail=null:n.sibling=null;break;case"collapsed":n=t.tail;for(var l=null;n!==null;)n.alternate!==null&&(l=n),n=n.sibling;l===null?e||t.tail===null?t.tail=null:t.tail.sibling=null:l.sibling=null}}function vt(t){var e=t.alternate!==null&&t.alternate.child===t.child,n=0,l=0;if(e)for(var a=t.child;a!==null;)n|=a.lanes|a.childLanes,l|=a.subtreeFlags&65011712,l|=a.flags&65011712,a.return=t,a=a.sibling;else for(a=t.child;a!==null;)n|=a.lanes|a.childLanes,l|=a.subtreeFlags,l|=a.flags,a.return=t,a=a.sibling;return t.subtreeFlags|=l,t.childLanes=n,e}function Sy(t,e,n){var l=e.pendingProps;switch(Dr(e),e.tag){case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return vt(e),null;case 1:return vt(e),null;case 3:return n=e.stateNode,l=null,t!==null&&(l=t.memoizedState.cache),e.memoizedState.cache!==l&&(e.flags|=2048),wn(Rt),Ca(),n.pendingContext&&(n.context=n.pendingContext,n.pendingContext=null),(t===null||t.child===null)&&(Pl(e)?mn(e):t===null||t.memoizedState.isDehydrated&&!(e.flags&256)||(e.flags|=1024,lc())),vt(e),null;case 26:var a=e.type,o=e.memoizedState;return t===null?(mn(e),o!==null?(vt(e),jf(e,o)):(vt(e),_c(e,a,null,l,n))):o?o!==t.memoizedState?(mn(e),vt(e),jf(e,o)):(vt(e),e.flags&=-16777217):(t=t.memoizedProps,t!==l&&mn(e),vt(e),_c(e,a,t,l,n)),null;case 27:if(ds(e),n=Kn.current,a=e.type,t!==null&&e.stateNode!=null)t.memoizedProps!==l&&mn(e);else{if(!l){if(e.stateNode===null)throw Error(w(166));return vt(e),null}t=nn.current,Pl(e)?hf(e,t):(t=$m(a,l,n),e.stateNode=t,mn(e))}return vt(e),null;case 5:if(ds(e),a=e.type,t!==null&&e.stateNode!=null)t.memoizedProps!==l&&mn(e);else{if(!l){if(e.stateNode===null)throw Error(w(166));return vt(e),null}if(o=nn.current,Pl(e))hf(e,o);else{var i=Ns(Kn.current);switch(o){case 1:o=i.createElementNS("http://www.w3.org/2000/svg",a);break;case 2:o=i.createElementNS("http://www.w3.org/1998/Math/MathML",a);break;default:switch(a){case"svg":o=i.createElementNS("http://www.w3.org/2000/svg",a);break;case"math":o=i.createElementNS("http://www.w3.org/1998/Math/MathML",a);break;case"script":o=i.createElement("div"),o.innerHTML="<script><\/script>",o=o.removeChild(o.firstChild);break;case"select":o=typeof l.is=="string"?i.createElement("select",{is:l.is}):i.createElement("select"),l.multiple?o.multiple=!0:l.size&&(o.size=l.size);break;default:o=typeof l.is=="string"?i.createElement(a,{is:l.is}):i.createElement(a)}}o[Kt]=e,o[_e]=l;t:for(i=e.child;i!==null;){if(i.tag===5||i.tag===6)o.appendChild(i.stateNode);else if(i.tag!==4&&i.tag!==27&&i.child!==null){i.child.return=i,i=i.child;continue}if(i===e)break t;for(;i.sibling===null;){if(i.return===null||i.return===e)break t;i=i.return}i.sibling.return=i.return,i=i.sibling}e.stateNode=o;t:switch(It(o,a,l),a){case"button":case"input":case"select":case"textarea":l=!!l.autoFocus;break t;case"img":l=!0;break t;default:l=!1}l&&mn(e)}}return vt(e),_c(e,e.type,t===null?null:t.memoizedProps,e.pendingProps,n),null;case 6:if(t&&e.stateNode!=null)t.memoizedProps!==l&&mn(e);else{if(typeof l!="string"&&e.stateNode===null)throw Error(w(166));if(t=Kn.current,Pl(e)){if(t=e.stateNode,n=e.memoizedProps,l=null,a=Jt,a!==null)switch(a.tag){case 27:case 5:l=a.memoizedProps}t[Kt]=e,t=!!(t.nodeValue===n||l!==null&&l.suppressHydrationWarning===!0||Qm(t.nodeValue,n)),t||al(e,!0)}else t=Ns(t).createTextNode(l),t[Kt]=e,e.stateNode=t}return vt(e),null;case 31:if(n=e.memoizedState,t===null||t.memoizedState!==null){if(l=Pl(e),n!==null){if(t===null){if(!l)throw Error(w(318));if(t=e.memoizedState,t=t!==null?t.dehydrated:null,!t)throw Error(w(557));t[Kt]=e}else El(),!(e.flags&128)&&(e.memoizedState=null),e.flags|=4;vt(e),t=!1}else n=lc(),t!==null&&t.memoizedState!==null&&(t.memoizedState.hydrationErrors=n),t=!0;if(!t)return e.flags&256?(be(e),e):(be(e),null);if(e.flags&128)throw Error(w(558))}return vt(e),null;case 13:if(l=e.memoizedState,t===null||t.memoizedState!==null&&t.memoizedState.dehydrated!==null){if(a=Pl(e),l!==null&&l.dehydrated!==null){if(t===null){if(!a)throw Error(w(318));if(a=e.memoizedState,a=a!==null?a.dehydrated:null,!a)throw Error(w(317));a[Kt]=e}else El(),!(e.flags&128)&&(e.memoizedState=null),e.flags|=4;vt(e),a=!1}else a=lc(),t!==null&&t.memoizedState!==null&&(t.memoizedState.hydrationErrors=a),a=!0;if(!a)return e.flags&256?(be(e),e):(be(e),null)}return be(e),e.flags&128?(e.lanes=n,e):(n=l!==null,t=t!==null&&t.memoizedState!==null,n&&(l=e.child,a=null,l.alternate!==null&&l.alternate.memoizedState!==null&&l.alternate.memoizedState.cachePool!==null&&(a=l.alternate.memoizedState.cachePool.pool),o=null,l.memoizedState!==null&&l.memoizedState.cachePool!==null&&(o=l.memoizedState.cachePool.pool),o!==a&&(l.flags|=2048)),n!==t&&n&&(e.child.flags|=8192),Xi(e,e.updateQueue),vt(e),null);case 4:return Ca(),t===null&&sd(e.stateNode.containerInfo),vt(e),null;case 10:return wn(e.type),vt(e),null;case 19:if($t(Lt),l=e.memoizedState,l===null)return vt(e),null;if(a=(e.flags&128)!==0,o=l.rendering,o===null)if(a)co(l,!1);else{if(zt!==0||t!==null&&t.flags&128)for(t=e.child;t!==null;){if(o=vs(t),o!==null){for(e.flags|=128,co(l,!1),t=o.updateQueue,e.updateQueue=t,Xi(e,t),e.subtreeFlags=0,t=n,n=e.child;n!==null;)l0(n,t),n=n.sibling;return pt(Lt,Lt.current&1|2),it&&pn(e,l.treeForkCount),e.child}t=t.sibling}l.tail!==null&&Ce()>Ts&&(e.flags|=128,a=!0,co(l,!1),e.lanes=4194304)}else{if(!a)if(t=vs(o),t!==null){if(e.flags|=128,a=!0,t=t.updateQueue,e.updateQueue=t,Xi(e,t),co(l,!0),l.tail===null&&l.tailMode==="hidden"&&!o.alternate&&!it)return vt(e),null}else 2*Ce()-l.renderingStartTime>Ts&&n!==536870912&&(e.flags|=128,a=!0,co(l,!1),e.lanes=4194304);l.isBackwards?(o.sibling=e.child,e.child=o):(t=l.last,t!==null?t.sibling=o:e.child=o,l.last=o)}return l.tail!==null?(t=l.tail,l.rendering=t,l.tail=t.sibling,l.renderingStartTime=Ce(),t.sibling=null,n=Lt.current,pt(Lt,a?n&1|2:n&1),it&&pn(e,l.treeForkCount),t):(vt(e),null);case 22:case 23:return be(e),Ur(),l=e.memoizedState!==null,t!==null?t.memoizedState!==null!==l&&(e.flags|=8192):l&&(e.flags|=8192),l?n&536870912&&!(e.flags&128)&&(vt(e),e.subtreeFlags&6&&(e.flags|=8192)):vt(e),n=e.updateQueue,n!==null&&Xi(e,n.retryQueue),n=null,t!==null&&t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(n=t.memoizedState.cachePool.pool),l=null,e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(l=e.memoizedState.cachePool.pool),l!==n&&(e.flags|=2048),t!==null&&$t(Cl),null;case 24:return n=null,t!==null&&(n=t.memoizedState.cache),e.memoizedState.cache!==n&&(e.flags|=2048),wn(Rt),vt(e),null;case 25:return null;case 30:return null}throw Error(w(156,e.tag))}function wy(t,e){switch(Dr(e),e.tag){case 1:return t=e.flags,t&65536?(e.flags=t&-65537|128,e):null;case 3:return wn(Rt),Ca(),t=e.flags,t&65536&&!(t&128)?(e.flags=t&-65537|128,e):null;case 26:case 27:case 5:return ds(e),null;case 31:if(e.memoizedState!==null){if(be(e),e.alternate===null)throw Error(w(340));El()}return t=e.flags,t&65536?(e.flags=t&-65537|128,e):null;case 13:if(be(e),t=e.memoizedState,t!==null&&t.dehydrated!==null){if(e.alternate===null)throw Error(w(340));El()}return t=e.flags,t&65536?(e.flags=t&-65537|128,e):null;case 19:return $t(Lt),null;case 4:return Ca(),null;case 10:return wn(e.type),null;case 22:case 23:return be(e),Ur(),t!==null&&$t(Cl),t=e.flags,t&65536?(e.flags=t&-65537|128,e):null;case 24:return wn(Rt),null;case 25:return null;default:return null}}function lm(t,e){switch(Dr(e),e.tag){case 3:wn(Rt),Ca();break;case 26:case 27:case 5:ds(e);break;case 4:Ca();break;case 31:e.memoizedState!==null&&be(e);break;case 13:be(e);break;case 19:$t(Lt);break;case 10:wn(e.type);break;case 22:case 23:be(e),Ur(),t!==null&&$t(Cl);break;case 24:wn(Rt)}}function ti(t,e){try{var n=e.updateQueue,l=n!==null?n.lastEffect:null;if(l!==null){var a=l.next;n=a;do{if((n.tag&t)===t){l=void 0;var o=n.create,i=n.inst;l=o(),i.destroy=l}n=n.next}while(n!==a)}}catch(s){_t(e,e.return,s)}}function ol(t,e,n){try{var l=e.updateQueue,a=l!==null?l.lastEffect:null;if(a!==null){var o=a.next;l=o;do{if((l.tag&t)===t){var i=l.inst,s=i.destroy;if(s!==void 0){i.destroy=void 0,a=e;var u=n,m=s;try{m()}catch(h){_t(a,u,h)}}}l=l.next}while(l!==o)}}catch(h){_t(e,e.return,h)}}function am(t){var e=t.updateQueue;if(e!==null){var n=t.stateNode;try{f0(e,n)}catch(l){_t(t,t.return,l)}}}function om(t,e,n){n.props=Ml(t.type,t.memoizedProps),n.state=t.memoizedState;try{n.componentWillUnmount()}catch(l){_t(t,e,l)}}function Ao(t,e){try{var n=t.ref;if(n!==null){switch(t.tag){case 26:case 27:case 5:var l=t.stateNode;break;case 30:l=t.stateNode;break;default:l=t.stateNode}typeof n=="function"?t.refCleanup=n(l):n.current=l}}catch(a){_t(t,e,a)}}function en(t,e){var n=t.ref,l=t.refCleanup;if(n!==null)if(typeof l=="function")try{l()}catch(a){_t(t,e,a)}finally{t.refCleanup=null,t=t.alternate,t!=null&&(t.refCleanup=null)}else if(typeof n=="function")try{n(null)}catch(a){_t(t,e,a)}else n.current=null}function im(t){var e=t.type,n=t.memoizedProps,l=t.stateNode;try{t:switch(e){case"button":case"input":case"select":case"textarea":n.autoFocus&&l.focus();break t;case"img":n.src?l.src=n.src:n.srcSet&&(l.srcset=n.srcSet)}}catch(a){_t(t,t.return,a)}}function fc(t,e,n){try{var l=t.stateNode;Zy(l,t.type,n,e),l[_e]=e}catch(a){_t(t,t.return,a)}}function sm(t){return t.tag===5||t.tag===3||t.tag===26||t.tag===27&&ul(t.type)||t.tag===4}function mc(t){t:for(;;){for(;t.sibling===null;){if(t.return===null||sm(t.return))return null;t=t.return}for(t.sibling.return=t.return,t=t.sibling;t.tag!==5&&t.tag!==6&&t.tag!==18;){if(t.tag===27&&ul(t.type)||t.flags&2||t.child===null||t.tag===4)continue t;t.child.return=t,t=t.child}if(!(t.flags&2))return t.stateNode}}function nr(t,e,n){var l=t.tag;if(l===5||l===6)t=t.stateNode,e?(n.nodeType===9?n.body:n.nodeName==="HTML"?n.ownerDocument.body:n).insertBefore(t,e):(e=n.nodeType===9?n.body:n.nodeName==="HTML"?n.ownerDocument.body:n,e.appendChild(t),n=n._reactRootContainer,n!=null||e.onclick!==null||(e.onclick=xn));else if(l!==4&&(l===27&&ul(t.type)&&(n=t.stateNode,e=null),t=t.child,t!==null))for(nr(t,e,n),t=t.sibling;t!==null;)nr(t,e,n),t=t.sibling}function Es(t,e,n){var l=t.tag;if(l===5||l===6)t=t.stateNode,e?n.insertBefore(t,e):n.appendChild(t);else if(l!==4&&(l===27&&ul(t.type)&&(n=t.stateNode),t=t.child,t!==null))for(Es(t,e,n),t=t.sibling;t!==null;)Es(t,e,n),t=t.sibling}function um(t){var e=t.stateNode,n=t.memoizedProps;try{for(var l=t.type,a=e.attributes;a.length;)e.removeAttributeNode(a[0]);It(e,l,n),e[Kt]=t,e[_e]=n}catch(o){_t(t,t.return,o)}}var bn=!1,Ht=!1,hc=!1,Xf=typeof WeakSet=="function"?WeakSet:Set,Zt=null;function Ey(t,e){if(t=t.containerInfo,cr=Ys,t=J1(t),Mr(t)){if("selectionStart"in t)var n={start:t.selectionStart,end:t.selectionEnd};else t:{n=(n=t.ownerDocument)&&n.defaultView||window;var l=n.getSelection&&n.getSelection();if(l&&l.rangeCount!==0){n=l.anchorNode;var a=l.anchorOffset,o=l.focusNode;l=l.focusOffset;try{n.nodeType,o.nodeType}catch{n=null;break t}var i=0,s=-1,u=-1,m=0,h=0,v=t,g=null;e:for(;;){for(var b;v!==n||a!==0&&v.nodeType!==3||(s=i+a),v!==o||l!==0&&v.nodeType!==3||(u=i+l),v.nodeType===3&&(i+=v.nodeValue.length),(b=v.firstChild)!==null;)g=v,v=b;for(;;){if(v===t)break e;if(g===n&&++m===a&&(s=i),g===o&&++h===l&&(u=i),(b=v.nextSibling)!==null)break;v=g,g=v.parentNode}v=b}n=s===-1||u===-1?null:{start:s,end:u}}else n=null}n=n||{start:0,end:0}}else n=null;for(rr={focusedElem:t,selectionRange:n},Ys=!1,Zt=e;Zt!==null;)if(e=Zt,t=e.child,(e.subtreeFlags&1028)!==0&&t!==null)t.return=e,Zt=t;else for(;Zt!==null;){switch(e=Zt,o=e.alternate,t=e.flags,e.tag){case 0:if(t&4&&(t=e.updateQueue,t=t!==null?t.events:null,t!==null))for(n=0;n<t.length;n++)a=t[n],a.ref.impl=a.nextImpl;break;case 11:case 15:break;case 1:if(t&1024&&o!==null){t=void 0,n=e,a=o.memoizedProps,o=o.memoizedState,l=n.stateNode;try{var T=Ml(n.type,a);t=l.getSnapshotBeforeUpdate(T,o),l.__reactInternalSnapshotBeforeUpdate=t}catch(O){_t(n,n.return,O)}}break;case 3:if(t&1024){if(t=e.stateNode.containerInfo,n=t.nodeType,n===9)_r(t);else if(n===1)switch(t.nodeName){case"HEAD":case"HTML":case"BODY":_r(t);break;default:t.textContent=""}}break;case 5:case 26:case 27:case 6:case 4:case 17:break;default:if(t&1024)throw Error(w(163))}if(t=e.sibling,t!==null){t.return=e.return,Zt=t;break}Zt=e.return}}function cm(t,e,n){var l=n.flags;switch(n.tag){case 0:case 11:case 15:yn(t,n),l&4&&ti(5,n);break;case 1:if(yn(t,n),l&4)if(t=n.stateNode,e===null)try{t.componentDidMount()}catch(i){_t(n,n.return,i)}else{var a=Ml(n.type,e.memoizedProps);e=e.memoizedState;try{t.componentDidUpdate(a,e,t.__reactInternalSnapshotBeforeUpdate)}catch(i){_t(n,n.return,i)}}l&64&&am(n),l&512&&Ao(n,n.return);break;case 3:if(yn(t,n),l&64&&(t=n.updateQueue,t!==null)){if(e=null,n.child!==null)switch(n.child.tag){case 27:case 5:e=n.child.stateNode;break;case 1:e=n.child.stateNode}try{f0(t,e)}catch(i){_t(n,n.return,i)}}break;case 27:e===null&&l&4&&um(n);case 26:case 5:yn(t,n),e===null&&l&4&&im(n),l&512&&Ao(n,n.return);break;case 12:yn(t,n);break;case 31:yn(t,n),l&4&&_m(t,n);break;case 13:yn(t,n),l&4&&fm(t,n),l&64&&(t=n.memoizedState,t!==null&&(t=t.dehydrated,t!==null&&(n=Dy.bind(null,n),Fy(t,n))));break;case 22:if(l=n.memoizedState!==null||bn,!l){e=e!==null&&e.memoizedState!==null||Ht,a=bn;var o=Ht;bn=l,(Ht=e)&&!o?gn(t,n,(n.subtreeFlags&8772)!==0):yn(t,n),bn=a,Ht=o}break;case 30:break;default:yn(t,n)}}function rm(t){var e=t.alternate;e!==null&&(t.alternate=null,rm(e)),t.child=null,t.deletions=null,t.sibling=null,t.tag===5&&(e=t.stateNode,e!==null&&Sr(e)),t.stateNode=null,t.return=null,t.dependencies=null,t.memoizedProps=null,t.memoizedState=null,t.pendingProps=null,t.stateNode=null,t.updateQueue=null}var Et=null,ce=!1;function hn(t,e,n){for(n=n.child;n!==null;)dm(t,e,n),n=n.sibling}function dm(t,e,n){if(Se&&typeof Se.onCommitFiberUnmount=="function")try{Se.onCommitFiberUnmount(Vo,n)}catch{}switch(n.tag){case 26:Ht||en(n,e),hn(t,e,n),n.memoizedState?n.memoizedState.count--:n.stateNode&&(n=n.stateNode,n.parentNode.removeChild(n));break;case 27:Ht||en(n,e);var l=Et,a=ce;ul(n.type)&&(Et=n.stateNode,ce=!1),hn(t,e,n),Lo(n.stateNode),Et=l,ce=a;break;case 5:Ht||en(n,e);case 6:if(l=Et,a=ce,Et=null,hn(t,e,n),Et=l,ce=a,Et!==null)if(ce)try{(Et.nodeType===9?Et.body:Et.nodeName==="HTML"?Et.ownerDocument.body:Et).removeChild(n.stateNode)}catch(o){_t(n,e,o)}else try{Et.removeChild(n.stateNode)}catch(o){_t(n,e,o)}break;case 18:Et!==null&&(ce?(t=Et,n1(t.nodeType===9?t.body:t.nodeName==="HTML"?t.ownerDocument.body:t,n.stateNode),Na(t)):n1(Et,n.stateNode));break;case 4:l=Et,a=ce,Et=n.stateNode.containerInfo,ce=!0,hn(t,e,n),Et=l,ce=a;break;case 0:case 11:case 14:case 15:ol(2,n,e),Ht||ol(4,n,e),hn(t,e,n);break;case 1:Ht||(en(n,e),l=n.stateNode,typeof l.componentWillUnmount=="function"&&om(n,e,l)),hn(t,e,n);break;case 21:hn(t,e,n);break;case 22:Ht=(l=Ht)||n.memoizedState!==null,hn(t,e,n),Ht=l;break;default:hn(t,e,n)}}function _m(t,e){if(e.memoizedState===null&&(t=e.alternate,t!==null&&(t=t.memoizedState,t!==null))){t=t.dehydrated;try{Na(t)}catch(n){_t(e,e.return,n)}}}function fm(t,e){if(e.memoizedState===null&&(t=e.alternate,t!==null&&(t=t.memoizedState,t!==null&&(t=t.dehydrated,t!==null))))try{Na(t)}catch(n){_t(e,e.return,n)}}function Ty(t){switch(t.tag){case 31:case 13:case 19:var e=t.stateNode;return e===null&&(e=t.stateNode=new Xf),e;case 22:return t=t.stateNode,e=t._retryCache,e===null&&(e=t._retryCache=new Xf),e;default:throw Error(w(435,t.tag))}}function Qi(t,e){var n=Ty(t);e.forEach(function(l){if(!n.has(l)){n.add(l);var a=By.bind(null,t,l);l.then(a,a)}})}function se(t,e){var n=e.deletions;if(n!==null)for(var l=0;l<n.length;l++){var a=n[l],o=t,i=e,s=i;t:for(;s!==null;){switch(s.tag){case 27:if(ul(s.type)){Et=s.stateNode,ce=!1;break t}break;case 5:Et=s.stateNode,ce=!1;break t;case 3:case 4:Et=s.stateNode.containerInfo,ce=!0;break t}s=s.return}if(Et===null)throw Error(w(160));dm(o,i,a),Et=null,ce=!1,o=a.alternate,o!==null&&(o.return=null),a.return=null}if(e.subtreeFlags&13886)for(e=e.child;e!==null;)mm(e,t),e=e.sibling}var Ze=null;function mm(t,e){var n=t.alternate,l=t.flags;switch(t.tag){case 0:case 11:case 14:case 15:se(e,t),ue(t),l&4&&(ol(3,t,t.return),ti(3,t),ol(5,t,t.return));break;case 1:se(e,t),ue(t),l&512&&(Ht||n===null||en(n,n.return)),l&64&&bn&&(t=t.updateQueue,t!==null&&(l=t.callbacks,l!==null&&(n=t.shared.hiddenCallbacks,t.shared.hiddenCallbacks=n===null?l:n.concat(l))));break;case 26:var a=Ze;if(se(e,t),ue(t),l&512&&(Ht||n===null||en(n,n.return)),l&4){var o=n!==null?n.memoizedState:null;if(l=t.memoizedState,n===null)if(l===null)if(t.stateNode===null){t:{l=t.type,n=t.memoizedProps,a=a.ownerDocument||a;e:switch(l){case"title":o=a.getElementsByTagName("title")[0],(!o||o[Wo]||o[Kt]||o.namespaceURI==="http://www.w3.org/2000/svg"||o.hasAttribute("itemprop"))&&(o=a.createElement(l),a.head.insertBefore(o,a.querySelector("head > title"))),It(o,l,n),o[Kt]=t,Gt(o),l=o;break t;case"link":var i=c1("link","href",a).get(l+(n.href||""));if(i){for(var s=0;s<i.length;s++)if(o=i[s],o.getAttribute("href")===(n.href==null||n.href===""?null:n.href)&&o.getAttribute("rel")===(n.rel==null?null:n.rel)&&o.getAttribute("title")===(n.title==null?null:n.title)&&o.getAttribute("crossorigin")===(n.crossOrigin==null?null:n.crossOrigin)){i.splice(s,1);break e}}o=a.createElement(l),It(o,l,n),a.head.appendChild(o);break;case"meta":if(i=c1("meta","content",a).get(l+(n.content||""))){for(s=0;s<i.length;s++)if(o=i[s],o.getAttribute("content")===(n.content==null?null:""+n.content)&&o.getAttribute("name")===(n.name==null?null:n.name)&&o.getAttribute("property")===(n.property==null?null:n.property)&&o.getAttribute("http-equiv")===(n.httpEquiv==null?null:n.httpEquiv)&&o.getAttribute("charset")===(n.charSet==null?null:n.charSet)){i.splice(s,1);break e}}o=a.createElement(l),It(o,l,n),a.head.appendChild(o);break;default:throw Error(w(468,l))}o[Kt]=t,Gt(o),l=o}t.stateNode=l}else r1(a,t.type,t.stateNode);else t.stateNode=u1(a,l,t.memoizedProps);else o!==l?(o===null?n.stateNode!==null&&(n=n.stateNode,n.parentNode.removeChild(n)):o.count--,l===null?r1(a,t.type,t.stateNode):u1(a,l,t.memoizedProps)):l===null&&t.stateNode!==null&&fc(t,t.memoizedProps,n.memoizedProps)}break;case 27:se(e,t),ue(t),l&512&&(Ht||n===null||en(n,n.return)),n!==null&&l&4&&fc(t,t.memoizedProps,n.memoizedProps);break;case 5:if(se(e,t),ue(t),l&512&&(Ht||n===null||en(n,n.return)),t.flags&32){a=t.stateNode;try{wa(a,"")}catch(T){_t(t,t.return,T)}}l&4&&t.stateNode!=null&&(a=t.memoizedProps,fc(t,a,n!==null?n.memoizedProps:a)),l&1024&&(hc=!0);break;case 6:if(se(e,t),ue(t),l&4){if(t.stateNode===null)throw Error(w(162));l=t.memoizedProps,n=t.stateNode;try{n.nodeValue=l}catch(T){_t(t,t.return,T)}}break;case 3:if(is=null,a=Ze,Ze=Os(e.containerInfo),se(e,t),Ze=a,ue(t),l&4&&n!==null&&n.memoizedState.isDehydrated)try{Na(e.containerInfo)}catch(T){_t(t,t.return,T)}hc&&(hc=!1,hm(t));break;case 4:l=Ze,Ze=Os(t.stateNode.containerInfo),se(e,t),ue(t),Ze=l;break;case 12:se(e,t),ue(t);break;case 31:se(e,t),ue(t),l&4&&(l=t.updateQueue,l!==null&&(t.updateQueue=null,Qi(t,l)));break;case 13:se(e,t),ue(t),t.child.flags&8192&&t.memoizedState!==null!=(n!==null&&n.memoizedState!==null)&&(Js=Ce()),l&4&&(l=t.updateQueue,l!==null&&(t.updateQueue=null,Qi(t,l)));break;case 22:a=t.memoizedState!==null;var u=n!==null&&n.memoizedState!==null,m=bn,h=Ht;if(bn=m||a,Ht=h||u,se(e,t),Ht=h,bn=m,ue(t),l&8192)t:for(e=t.stateNode,e._visibility=a?e._visibility&-2:e._visibility|1,a&&(n===null||u||bn||Ht||bl(t)),n=null,e=t;;){if(e.tag===5||e.tag===26){if(n===null){u=n=e;try{if(o=u.stateNode,a)i=o.style,typeof i.setProperty=="function"?i.setProperty("display","none","important"):i.display="none";else{s=u.stateNode;var v=u.memoizedProps.style,g=v!=null&&v.hasOwnProperty("display")?v.display:null;s.style.display=g==null||typeof g=="boolean"?"":(""+g).trim()}}catch(T){_t(u,u.return,T)}}}else if(e.tag===6){if(n===null){u=e;try{u.stateNode.nodeValue=a?"":u.memoizedProps}catch(T){_t(u,u.return,T)}}}else if(e.tag===18){if(n===null){u=e;try{var b=u.stateNode;a?l1(b,!0):l1(u.stateNode,!1)}catch(T){_t(u,u.return,T)}}}else if((e.tag!==22&&e.tag!==23||e.memoizedState===null||e===t)&&e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break t;for(;e.sibling===null;){if(e.return===null||e.return===t)break t;n===e&&(n=null),e=e.return}n===e&&(n=null),e.sibling.return=e.return,e=e.sibling}l&4&&(l=t.updateQueue,l!==null&&(n=l.retryQueue,n!==null&&(l.retryQueue=null,Qi(t,n))));break;case 19:se(e,t),ue(t),l&4&&(l=t.updateQueue,l!==null&&(t.updateQueue=null,Qi(t,l)));break;case 30:break;case 21:break;default:se(e,t),ue(t)}}function ue(t){var e=t.flags;if(e&2){try{for(var n,l=t.return;l!==null;){if(sm(l)){n=l;break}l=l.return}if(n==null)throw Error(w(160));switch(n.tag){case 27:var a=n.stateNode,o=mc(t);Es(t,o,a);break;case 5:var i=n.stateNode;n.flags&32&&(wa(i,""),n.flags&=-33);var s=mc(t);Es(t,s,i);break;case 3:case 4:var u=n.stateNode.containerInfo,m=mc(t);nr(t,m,u);break;default:throw Error(w(161))}}catch(h){_t(t,t.return,h)}t.flags&=-3}e&4096&&(t.flags&=-4097)}function hm(t){if(t.subtreeFlags&1024)for(t=t.child;t!==null;){var e=t;hm(e),e.tag===5&&e.flags&1024&&e.stateNode.reset(),t=t.sibling}}function yn(t,e){if(e.subtreeFlags&8772)for(e=e.child;e!==null;)cm(t,e.alternate,e),e=e.sibling}function bl(t){for(t=t.child;t!==null;){var e=t;switch(e.tag){case 0:case 11:case 14:case 15:ol(4,e,e.return),bl(e);break;case 1:en(e,e.return);var n=e.stateNode;typeof n.componentWillUnmount=="function"&&om(e,e.return,n),bl(e);break;case 27:Lo(e.stateNode);case 26:case 5:en(e,e.return),bl(e);break;case 22:e.memoizedState===null&&bl(e);break;case 30:bl(e);break;default:bl(e)}t=t.sibling}}function gn(t,e,n){for(n=n&&(e.subtreeFlags&8772)!==0,e=e.child;e!==null;){var l=e.alternate,a=t,o=e,i=o.flags;switch(o.tag){case 0:case 11:case 15:gn(a,o,n),ti(4,o);break;case 1:if(gn(a,o,n),l=o,a=l.stateNode,typeof a.componentDidMount=="function")try{a.componentDidMount()}catch(m){_t(l,l.return,m)}if(l=o,a=l.updateQueue,a!==null){var s=l.stateNode;try{var u=a.shared.hiddenCallbacks;if(u!==null)for(a.shared.hiddenCallbacks=null,a=0;a<u.length;a++)_0(u[a],s)}catch(m){_t(l,l.return,m)}}n&&i&64&&am(o),Ao(o,o.return);break;case 27:um(o);case 26:case 5:gn(a,o,n),n&&l===null&&i&4&&im(o),Ao(o,o.return);break;case 12:gn(a,o,n);break;case 31:gn(a,o,n),n&&i&4&&_m(a,o);break;case 13:gn(a,o,n),n&&i&4&&fm(a,o);break;case 22:o.memoizedState===null&&gn(a,o,n),Ao(o,o.return);break;case 30:break;default:gn(a,o,n)}e=e.sibling}}function ed(t,e){var n=null;t!==null&&t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(n=t.memoizedState.cachePool.pool),t=null,e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(t=e.memoizedState.cachePool.pool),t!==n&&(t!=null&&t.refCount++,n!=null&&Fo(n))}function nd(t,e){t=null,e.alternate!==null&&(t=e.alternate.memoizedState.cache),e=e.memoizedState.cache,e!==t&&(e.refCount++,t!=null&&Fo(t))}function qe(t,e,n,l){if(e.subtreeFlags&10256)for(e=e.child;e!==null;)ym(t,e,n,l),e=e.sibling}function ym(t,e,n,l){var a=e.flags;switch(e.tag){case 0:case 11:case 15:qe(t,e,n,l),a&2048&&ti(9,e);break;case 1:qe(t,e,n,l);break;case 3:qe(t,e,n,l),a&2048&&(t=null,e.alternate!==null&&(t=e.alternate.memoizedState.cache),e=e.memoizedState.cache,e!==t&&(e.refCount++,t!=null&&Fo(t)));break;case 12:if(a&2048){qe(t,e,n,l),t=e.stateNode;try{var o=e.memoizedProps,i=o.id,s=o.onPostCommit;typeof s=="function"&&s(i,e.alternate===null?"mount":"update",t.passiveEffectDuration,-0)}catch(u){_t(e,e.return,u)}}else qe(t,e,n,l);break;case 31:qe(t,e,n,l);break;case 13:qe(t,e,n,l);break;case 23:break;case 22:o=e.stateNode,i=e.alternate,e.memoizedState!==null?o._visibility&2?qe(t,e,n,l):ko(t,e):o._visibility&2?qe(t,e,n,l):(o._visibility|=2,ea(t,e,n,l,(e.subtreeFlags&10256)!==0||!1)),a&2048&&ed(i,e);break;case 24:qe(t,e,n,l),a&2048&&nd(e.alternate,e);break;default:qe(t,e,n,l)}}function ea(t,e,n,l,a){for(a=a&&((e.subtreeFlags&10256)!==0||!1),e=e.child;e!==null;){var o=t,i=e,s=n,u=l,m=i.flags;switch(i.tag){case 0:case 11:case 15:ea(o,i,s,u,a),ti(8,i);break;case 23:break;case 22:var h=i.stateNode;i.memoizedState!==null?h._visibility&2?ea(o,i,s,u,a):ko(o,i):(h._visibility|=2,ea(o,i,s,u,a)),a&&m&2048&&ed(i.alternate,i);break;case 24:ea(o,i,s,u,a),a&&m&2048&&nd(i.alternate,i);break;default:ea(o,i,s,u,a)}e=e.sibling}}function ko(t,e){if(e.subtreeFlags&10256)for(e=e.child;e!==null;){var n=t,l=e,a=l.flags;switch(l.tag){case 22:ko(n,l),a&2048&&ed(l.alternate,l);break;case 24:ko(n,l),a&2048&&nd(l.alternate,l);break;default:ko(n,l)}e=e.sibling}}var po=8192;function ta(t,e,n){if(t.subtreeFlags&po)for(t=t.child;t!==null;)gm(t,e,n),t=t.sibling}function gm(t,e,n){switch(t.tag){case 26:ta(t,e,n),t.flags&po&&t.memoizedState!==null&&rg(n,Ze,t.memoizedState,t.memoizedProps);break;case 5:ta(t,e,n);break;case 3:case 4:var l=Ze;Ze=Os(t.stateNode.containerInfo),ta(t,e,n),Ze=l;break;case 22:t.memoizedState===null&&(l=t.alternate,l!==null&&l.memoizedState!==null?(l=po,po=16777216,ta(t,e,n),po=l):ta(t,e,n));break;default:ta(t,e,n)}}function pm(t){var e=t.alternate;if(e!==null&&(t=e.child,t!==null)){e.child=null;do e=t.sibling,t.sibling=null,t=e;while(t!==null)}}function ro(t){var e=t.deletions;if(t.flags&16){if(e!==null)for(var n=0;n<e.length;n++){var l=e[n];Zt=l,vm(l,t)}pm(t)}if(t.subtreeFlags&10256)for(t=t.child;t!==null;)bm(t),t=t.sibling}function bm(t){switch(t.tag){case 0:case 11:case 15:ro(t),t.flags&2048&&ol(9,t,t.return);break;case 3:ro(t);break;case 12:ro(t);break;case 22:var e=t.stateNode;t.memoizedState!==null&&e._visibility&2&&(t.return===null||t.return.tag!==13)?(e._visibility&=-3,as(t)):ro(t);break;default:ro(t)}}function as(t){var e=t.deletions;if(t.flags&16){if(e!==null)for(var n=0;n<e.length;n++){var l=e[n];Zt=l,vm(l,t)}pm(t)}for(t=t.child;t!==null;){switch(e=t,e.tag){case 0:case 11:case 15:ol(8,e,e.return),as(e);break;case 22:n=e.stateNode,n._visibility&2&&(n._visibility&=-3,as(e));break;default:as(e)}t=t.sibling}}function vm(t,e){for(;Zt!==null;){var n=Zt;switch(n.tag){case 0:case 11:case 15:ol(8,n,e);break;case 23:case 22:if(n.memoizedState!==null&&n.memoizedState.cachePool!==null){var l=n.memoizedState.cachePool.pool;l!=null&&l.refCount++}break;case 24:Fo(n.memoizedState.cache)}if(l=n.child,l!==null)l.return=n,Zt=l;else t:for(n=t;Zt!==null;){l=Zt;var a=l.sibling,o=l.return;if(rm(l),l===n){Zt=null;break t}if(a!==null){a.return=o,Zt=a;break t}Zt=o}}}var Ay={getCacheForType:function(t){var e=Wt(Rt),n=e.data.get(t);return n===void 0&&(n=t(),e.data.set(t,n)),n},cacheSignal:function(){return Wt(Rt).controller.signal}},ky=typeof WeakMap=="function"?WeakMap:Map,ct=0,gt=null,nt=null,at=0,dt=0,pe=null,Gn=!1,Ha=!1,ld=!1,zn=0,zt=0,il=0,wl=0,ad=0,xe=0,ka=0,Mo=null,re=null,lr=!1,Js=0,xm=0,Ts=1/0,As=null,Fn=null,Xt=0,Pn=null,Ma=null,En=0,ar=0,or=null,Cm=null,zo=0,ir=null;function Ee(){return ct&2&&at!==0?at&-at:Q.T!==null?id():L1()}function Sm(){if(xe===0)if(!(at&536870912)||it){var t=Ni;Ni<<=1,!(Ni&3932160)&&(Ni=262144),xe=t}else xe=536870912;return t=Ae.current,t!==null&&(t.flags|=32),xe}function de(t,e,n){(t===gt&&(dt===2||dt===9)||t.cancelPendingCommit!==null)&&(za(t,0),$n(t,at,xe,!1)),Jo(t,n),(!(ct&2)||t!==gt)&&(t===gt&&(!(ct&2)&&(wl|=n),zt===4&&$n(t,at,xe,!1)),an(t))}function wm(t,e,n){if(ct&6)throw Error(w(327));var l=!n&&(e&127)===0&&(e&t.expiredLanes)===0||Ko(t,e),a=l?Ly(t,e):yc(t,e,!0),o=l;do{if(a===0){Ha&&!l&&$n(t,e,0,!1);break}else{if(n=t.current.alternate,o&&!My(n)){a=yc(t,e,!1),o=!1;continue}if(a===2){if(o=e,t.errorRecoveryDisabledLanes&o)var i=0;else i=t.pendingLanes&-536870913,i=i!==0?i:i&536870912?536870912:0;if(i!==0){e=i;t:{var s=t;a=Mo;var u=s.current.memoizedState.isDehydrated;if(u&&(za(s,i).flags|=256),i=yc(s,i,!1),i!==2){if(ld&&!u){s.errorRecoveryDisabledLanes|=o,wl|=o,a=4;break t}o=re,re=a,o!==null&&(re===null?re=o:re.push.apply(re,o))}a=i}if(o=!1,a!==2)continue}}if(a===1){za(t,0),$n(t,e,0,!0);break}t:{switch(l=t,o=a,o){case 0:case 1:throw Error(w(345));case 4:if((e&4194048)!==e)break;case 6:$n(l,e,xe,!Gn);break t;case 2:re=null;break;case 3:case 5:break;default:throw Error(w(329))}if((e&62914560)===e&&(a=Js+300-Ce(),10<a)){if($n(l,e,xe,!Gn),Rs(l,0,!0)!==0)break t;En=e,l.timeoutHandle=Zm(Qf.bind(null,l,n,re,As,lr,e,xe,wl,ka,Gn,o,"Throttled",-0,0),a);break t}Qf(l,n,re,As,lr,e,xe,wl,ka,Gn,o,null,-0,0)}}break}while(!0);an(t)}function Qf(t,e,n,l,a,o,i,s,u,m,h,v,g,b){if(t.timeoutHandle=-1,v=e.subtreeFlags,v&8192||(v&16785408)===16785408){v={stylesheets:null,count:0,imgCount:0,imgBytes:0,suspenseyImages:[],waitingForImages:!0,waitingForViewTransition:!1,unsuspend:xn},gm(e,o,v);var T=(o&62914560)===o?Js-Ce():(o&4194048)===o?xm-Ce():0;if(T=dg(v,T),T!==null){En=o,t.cancelPendingCommit=T(Zf.bind(null,t,e,o,n,l,a,i,s,u,h,v,null,g,b)),$n(t,o,i,!m);return}}Zf(t,e,o,n,l,a,i,s,u)}function My(t){for(var e=t;;){var n=e.tag;if((n===0||n===11||n===15)&&e.flags&16384&&(n=e.updateQueue,n!==null&&(n=n.stores,n!==null)))for(var l=0;l<n.length;l++){var a=n[l],o=a.getSnapshot;a=a.value;try{if(!Te(o(),a))return!1}catch{return!1}}if(n=e.child,e.subtreeFlags&16384&&n!==null)n.return=e,e=n;else{if(e===t)break;for(;e.sibling===null;){if(e.return===null||e.return===t)return!0;e=e.return}e.sibling.return=e.return,e=e.sibling}}return!0}function $n(t,e,n,l){e&=~ad,e&=~wl,t.suspendedLanes|=e,t.pingedLanes&=~e,l&&(t.warmLanes|=e),l=t.expirationTimes;for(var a=e;0<a;){var o=31-we(a),i=1<<o;l[o]=-1,a&=~i}n!==0&&k1(t,n,e)}function Ws(){return ct&6?!0:(ei(0,!1),!1)}function od(){if(nt!==null){if(dt===0)var t=nt.return;else t=nt,Cn=Dl=null,Zr(t),ba=null,Ro=0,t=nt;for(;t!==null;)lm(t.alternate,t),t=t.return;nt=null}}function za(t,e){var n=t.timeoutHandle;n!==-1&&(t.timeoutHandle=-1,Vy(n)),n=t.cancelPendingCommit,n!==null&&(t.cancelPendingCommit=null,n()),En=0,od(),gt=t,nt=n=Sn(t.current,null),at=e,dt=0,pe=null,Gn=!1,Ha=Ko(t,e),ld=!1,ka=xe=ad=wl=il=zt=0,re=Mo=null,lr=!1,e&8&&(e|=e&32);var l=t.entangledLanes;if(l!==0)for(t=t.entanglements,l&=e;0<l;){var a=31-we(l),o=1<<a;e|=t[a],l&=~o}return zn=e,Qs(),n}function Em(t,e){W=null,Q.H=jo,e===Ya||e===Zs?(e=vf(),dt=3):e===Hr?(e=vf(),dt=4):dt=e===Pr?8:e!==null&&typeof e=="object"&&typeof e.then=="function"?6:1,pe=e,nt===null&&(zt=1,Ss(t,He(e,t.current)))}function Tm(){var t=Ae.current;return t===null?!0:(at&4194048)===at?Ue===null:(at&62914560)===at||at&536870912?t===Ue:!1}function Am(){var t=Q.H;return Q.H=jo,t===null?jo:t}function km(){var t=Q.A;return Q.A=Ay,t}function ks(){zt=4,Gn||(at&4194048)!==at&&Ae.current!==null||(Ha=!0),!(il&134217727)&&!(wl&134217727)||gt===null||$n(gt,at,xe,!1)}function yc(t,e,n){var l=ct;ct|=2;var a=Am(),o=km();(gt!==t||at!==e)&&(As=null,za(t,e)),e=!1;var i=zt;t:do try{if(dt!==0&&nt!==null){var s=nt,u=pe;switch(dt){case 8:od(),i=6;break t;case 3:case 2:case 9:case 6:Ae.current===null&&(e=!0);var m=dt;if(dt=0,pe=null,ma(t,s,u,m),n&&Ha){i=0;break t}break;default:m=dt,dt=0,pe=null,ma(t,s,u,m)}}zy(),i=zt;break}catch(h){Em(t,h)}while(!0);return e&&t.shellSuspendCounter++,Cn=Dl=null,ct=l,Q.H=a,Q.A=o,nt===null&&(gt=null,at=0,Qs()),i}function zy(){for(;nt!==null;)Mm(nt)}function Ly(t,e){var n=ct;ct|=2;var l=Am(),a=km();gt!==t||at!==e?(As=null,Ts=Ce()+500,za(t,e)):Ha=Ko(t,e);t:do try{if(dt!==0&&nt!==null){e=nt;var o=pe;e:switch(dt){case 1:dt=0,pe=null,ma(t,e,o,1);break;case 2:case 9:if(bf(o)){dt=0,pe=null,qf(e);break}e=function(){dt!==2&&dt!==9||gt!==t||(dt=7),an(t)},o.then(e,e);break t;case 3:dt=7;break t;case 4:dt=5;break t;case 7:bf(o)?(dt=0,pe=null,qf(e)):(dt=0,pe=null,ma(t,e,o,7));break;case 5:var i=null;switch(nt.tag){case 26:i=nt.memoizedState;case 5:case 27:var s=nt;if(i?Jm(i):s.stateNode.complete){dt=0,pe=null;var u=s.sibling;if(u!==null)nt=u;else{var m=s.return;m!==null?(nt=m,Is(m)):nt=null}break e}}dt=0,pe=null,ma(t,e,o,5);break;case 6:dt=0,pe=null,ma(t,e,o,6);break;case 8:od(),zt=6;break t;default:throw Error(w(462))}}Ny();break}catch(h){Em(t,h)}while(!0);return Cn=Dl=null,Q.H=l,Q.A=a,ct=n,nt!==null?0:(gt=null,at=0,Qs(),zt)}function Ny(){for(;nt!==null&&!eh();)Mm(nt)}function Mm(t){var e=nm(t.alternate,t,zn);t.memoizedProps=t.pendingProps,e===null?Is(t):nt=e}function qf(t){var e=t,n=e.alternate;switch(e.tag){case 15:case 0:e=Yf(n,e,e.pendingProps,e.type,void 0,at);break;case 11:e=Yf(n,e,e.pendingProps,e.type.render,e.ref,at);break;case 5:Zr(e);default:lm(n,e),e=nt=l0(e,zn),e=nm(n,e,zn)}t.memoizedProps=t.pendingProps,e===null?Is(t):nt=e}function ma(t,e,n,l){Cn=Dl=null,Zr(e),ba=null,Ro=0;var a=e.return;try{if(vy(t,a,e,n,at)){zt=1,Ss(t,He(n,t.current)),nt=null;return}}catch(o){if(a!==null)throw nt=a,o;zt=1,Ss(t,He(n,t.current)),nt=null;return}e.flags&32768?(it||l===1?t=!0:Ha||at&536870912?t=!1:(Gn=t=!0,(l===2||l===9||l===3||l===6)&&(l=Ae.current,l!==null&&l.tag===13&&(l.flags|=16384))),zm(e,t)):Is(e)}function Is(t){var e=t;do{if(e.flags&32768){zm(e,Gn);return}t=e.return;var n=Sy(e.alternate,e,zn);if(n!==null){nt=n;return}if(e=e.sibling,e!==null){nt=e;return}nt=e=t}while(e!==null);zt===0&&(zt=5)}function zm(t,e){do{var n=wy(t.alternate,t);if(n!==null){n.flags&=32767,nt=n;return}if(n=t.return,n!==null&&(n.flags|=32768,n.subtreeFlags=0,n.deletions=null),!e&&(t=t.sibling,t!==null)){nt=t;return}nt=t=n}while(t!==null);zt=6,nt=null}function Zf(t,e,n,l,a,o,i,s,u){t.cancelPendingCommit=null;do Fs();while(Xt!==0);if(ct&6)throw Error(w(327));if(e!==null){if(e===t.current)throw Error(w(177));if(o=e.lanes|e.childLanes,o|=zr,dh(t,n,o,i,s,u),t===gt&&(nt=gt=null,at=0),Ma=e,Pn=t,En=n,ar=o,or=a,Cm=l,e.subtreeFlags&10256||e.flags&10256?(t.callbackNode=null,t.callbackPriority=0,Yy(_s,function(){return Bm(),null})):(t.callbackNode=null,t.callbackPriority=0),l=(e.flags&13878)!==0,e.subtreeFlags&13878||l){l=Q.T,Q.T=null,a=rt.p,rt.p=2,i=ct,ct|=4;try{Ey(t,e,n)}finally{ct=i,rt.p=a,Q.T=l}}Xt=1,Lm(),Nm(),Om()}}function Lm(){if(Xt===1){Xt=0;var t=Pn,e=Ma,n=(e.flags&13878)!==0;if(e.subtreeFlags&13878||n){n=Q.T,Q.T=null;var l=rt.p;rt.p=2;var a=ct;ct|=4;try{mm(e,t);var o=rr,i=J1(t.containerInfo),s=o.focusedElem,u=o.selectionRange;if(i!==s&&s&&s.ownerDocument&&K1(s.ownerDocument.documentElement,s)){if(u!==null&&Mr(s)){var m=u.start,h=u.end;if(h===void 0&&(h=m),"selectionStart"in s)s.selectionStart=m,s.selectionEnd=Math.min(h,s.value.length);else{var v=s.ownerDocument||document,g=v&&v.defaultView||window;if(g.getSelection){var b=g.getSelection(),T=s.textContent.length,O=Math.min(u.start,T),L=u.end===void 0?O:Math.min(u.end,T);!b.extend&&O>L&&(i=L,L=O,O=i);var f=_f(s,O),_=_f(s,L);if(f&&_&&(b.rangeCount!==1||b.anchorNode!==f.node||b.anchorOffset!==f.offset||b.focusNode!==_.node||b.focusOffset!==_.offset)){var p=v.createRange();p.setStart(f.node,f.offset),b.removeAllRanges(),O>L?(b.addRange(p),b.extend(_.node,_.offset)):(p.setEnd(_.node,_.offset),b.addRange(p))}}}}for(v=[],b=s;b=b.parentNode;)b.nodeType===1&&v.push({element:b,left:b.scrollLeft,top:b.scrollTop});for(typeof s.focus=="function"&&s.focus(),s=0;s<v.length;s++){var C=v[s];C.element.scrollLeft=C.left,C.element.scrollTop=C.top}}Ys=!!cr,rr=cr=null}finally{ct=a,rt.p=l,Q.T=n}}t.current=e,Xt=2}}function Nm(){if(Xt===2){Xt=0;var t=Pn,e=Ma,n=(e.flags&8772)!==0;if(e.subtreeFlags&8772||n){n=Q.T,Q.T=null;var l=rt.p;rt.p=2;var a=ct;ct|=4;try{cm(t,e.alternate,e)}finally{ct=a,rt.p=l,Q.T=n}}Xt=3}}function Om(){if(Xt===4||Xt===3){Xt=0,nh();var t=Pn,e=Ma,n=En,l=Cm;e.subtreeFlags&10256||e.flags&10256?Xt=5:(Xt=0,Ma=Pn=null,Dm(t,t.pendingLanes));var a=t.pendingLanes;if(a===0&&(Fn=null),Cr(n),e=e.stateNode,Se&&typeof Se.onCommitFiberRoot=="function")try{Se.onCommitFiberRoot(Vo,e,void 0,(e.current.flags&128)===128)}catch{}if(l!==null){e=Q.T,a=rt.p,rt.p=2,Q.T=null;try{for(var o=t.onRecoverableError,i=0;i<l.length;i++){var s=l[i];o(s.value,{componentStack:s.stack})}}finally{Q.T=e,rt.p=a}}En&3&&Fs(),an(t),a=t.pendingLanes,n&261930&&a&42?t===ir?zo++:(zo=0,ir=t):zo=0,ei(0,!1)}}function Dm(t,e){(t.pooledCacheLanes&=e)===0&&(e=t.pooledCache,e!=null&&(t.pooledCache=null,Fo(e)))}function Fs(){return Lm(),Nm(),Om(),Bm()}function Bm(){if(Xt!==5)return!1;var t=Pn,e=ar;ar=0;var n=Cr(En),l=Q.T,a=rt.p;try{rt.p=32>n?32:n,Q.T=null,n=or,or=null;var o=Pn,i=En;if(Xt=0,Ma=Pn=null,En=0,ct&6)throw Error(w(331));var s=ct;if(ct|=4,bm(o.current),ym(o,o.current,i,n),ct=s,ei(0,!1),Se&&typeof Se.onPostCommitFiberRoot=="function")try{Se.onPostCommitFiberRoot(Vo,o)}catch{}return!0}finally{rt.p=a,Q.T=l,Dm(t,e)}}function Gf(t,e,n){e=He(n,e),e=Pc(t.stateNode,e,2),t=In(t,e,2),t!==null&&(Jo(t,2),an(t))}function _t(t,e,n){if(t.tag===3)Gf(t,t,n);else for(;e!==null;){if(e.tag===3){Gf(e,t,n);break}else if(e.tag===1){var l=e.stateNode;if(typeof e.type.getDerivedStateFromError=="function"||typeof l.componentDidCatch=="function"&&(Fn===null||!Fn.has(l))){t=He(n,t),n=W0(2),l=In(e,n,2),l!==null&&(I0(n,l,e,t),Jo(l,2),an(l));break}}e=e.return}}function gc(t,e,n){var l=t.pingCache;if(l===null){l=t.pingCache=new ky;var a=new Set;l.set(e,a)}else a=l.get(e),a===void 0&&(a=new Set,l.set(e,a));a.has(n)||(ld=!0,a.add(n),t=Oy.bind(null,t,e,n),e.then(t,t))}function Oy(t,e,n){var l=t.pingCache;l!==null&&l.delete(e),t.pingedLanes|=t.suspendedLanes&n,t.warmLanes&=~n,gt===t&&(at&n)===n&&(zt===4||zt===3&&(at&62914560)===at&&300>Ce()-Js?!(ct&2)&&za(t,0):ad|=n,ka===at&&(ka=0)),an(t)}function Ym(t,e){e===0&&(e=A1()),t=Ol(t,e),t!==null&&(Jo(t,e),an(t))}function Dy(t){var e=t.memoizedState,n=0;e!==null&&(n=e.retryLane),Ym(t,n)}function By(t,e){var n=0;switch(t.tag){case 31:case 13:var l=t.stateNode,a=t.memoizedState;a!==null&&(n=a.retryLane);break;case 19:l=t.stateNode;break;case 22:l=t.stateNode._retryCache;break;default:throw Error(w(314))}l!==null&&l.delete(e),Ym(t,n)}function Yy(t,e){return vr(t,e)}var Ms=null,na=null,sr=!1,zs=!1,pc=!1,Vn=0;function an(t){t!==na&&t.next===null&&(na===null?Ms=na=t:na=na.next=t),zs=!0,sr||(sr=!0,Ry())}function ei(t,e){if(!pc&&zs){pc=!0;do for(var n=!1,l=Ms;l!==null;){if(!e)if(t!==0){var a=l.pendingLanes;if(a===0)var o=0;else{var i=l.suspendedLanes,s=l.pingedLanes;o=(1<<31-we(42|t)+1)-1,o&=a&~(i&~s),o=o&201326741?o&201326741|1:o?o|2:0}o!==0&&(n=!0,$f(l,o))}else o=at,o=Rs(l,l===gt?o:0,l.cancelPendingCommit!==null||l.timeoutHandle!==-1),!(o&3)||Ko(l,o)||(n=!0,$f(l,o));l=l.next}while(n);pc=!1}}function Hy(){Hm()}function Hm(){zs=sr=!1;var t=0;Vn!==0&&$y()&&(t=Vn);for(var e=Ce(),n=null,l=Ms;l!==null;){var a=l.next,o=Rm(l,e);o===0?(l.next=null,n===null?Ms=a:n.next=a,a===null&&(na=n)):(n=l,(t!==0||o&3)&&(zs=!0)),l=a}Xt!==0&&Xt!==5||ei(t,!1),Vn!==0&&(Vn=0)}function Rm(t,e){for(var n=t.suspendedLanes,l=t.pingedLanes,a=t.expirationTimes,o=t.pendingLanes&-62914561;0<o;){var i=31-we(o),s=1<<i,u=a[i];u===-1?(!(s&n)||s&l)&&(a[i]=rh(s,e)):u<=e&&(t.expiredLanes|=s),o&=~s}if(e=gt,n=at,n=Rs(t,t===e?n:0,t.cancelPendingCommit!==null||t.timeoutHandle!==-1),l=t.callbackNode,n===0||t===e&&(dt===2||dt===9)||t.cancelPendingCommit!==null)return l!==null&&l!==null&&Vu(l),t.callbackNode=null,t.callbackPriority=0;if(!(n&3)||Ko(t,n)){if(e=n&-n,e===t.callbackPriority)return e;switch(l!==null&&Vu(l),Cr(n)){case 2:case 8:n=E1;break;case 32:n=_s;break;case 268435456:n=T1;break;default:n=_s}return l=Um.bind(null,t),n=vr(n,l),t.callbackPriority=e,t.callbackNode=n,e}return l!==null&&l!==null&&Vu(l),t.callbackPriority=2,t.callbackNode=null,2}function Um(t,e){if(Xt!==0&&Xt!==5)return t.callbackNode=null,t.callbackPriority=0,null;var n=t.callbackNode;if(Fs()&&t.callbackNode!==n)return null;var l=at;return l=Rs(t,t===gt?l:0,t.cancelPendingCommit!==null||t.timeoutHandle!==-1),l===0?null:(wm(t,l,e),Rm(t,Ce()),t.callbackNode!=null&&t.callbackNode===n?Um.bind(null,t):null)}function $f(t,e){if(Fs())return null;wm(t,e,!0)}function Ry(){Ky(function(){ct&6?vr(w1,Hy):Hm()})}function id(){if(Vn===0){var t=Ea;t===0&&(t=Li,Li<<=1,!(Li&261888)&&(Li=256)),Vn=t}return Vn}function Vf(t){return t==null||typeof t=="symbol"||typeof t=="boolean"?null:typeof t=="function"?t:Ji(""+t)}function Kf(t,e){var n=e.ownerDocument.createElement("input");return n.name=e.name,n.value=e.value,t.id&&n.setAttribute("form",t.id),e.parentNode.insertBefore(n,e),t=new FormData(t),n.parentNode.removeChild(n),t}function Uy(t,e,n,l,a){if(e==="submit"&&n&&n.stateNode===a){var o=Vf((a[_e]||null).action),i=l.submitter;i&&(e=(e=i[_e]||null)?Vf(e.formAction):i.getAttribute("formAction"),e!==null&&(o=e,i=null));var s=new Us("action","action",null,l,a);t.push({event:s,listeners:[{instance:null,listener:function(){if(l.defaultPrevented){if(Vn!==0){var u=i?Kf(a,i):new FormData(a);Ic(n,{pending:!0,data:u,method:a.method,action:o},null,u)}}else typeof o=="function"&&(s.preventDefault(),u=i?Kf(a,i):new FormData(a),Ic(n,{pending:!0,data:u,method:a.method,action:o},o,u))},currentTarget:a}]})}}for(qi=0;qi<Uc.length;qi++)Zi=Uc[qi],Jf=Zi.toLowerCase(),Wf=Zi[0].toUpperCase()+Zi.slice(1),Ge(Jf,"on"+Wf);var Zi,Jf,Wf,qi;Ge(I1,"onAnimationEnd");Ge(F1,"onAnimationIteration");Ge(P1,"onAnimationStart");Ge("dblclick","onDoubleClick");Ge("focusin","onFocus");Ge("focusout","onBlur");Ge(ly,"onTransitionRun");Ge(ay,"onTransitionStart");Ge(oy,"onTransitionCancel");Ge(t0,"onTransitionEnd");Sa("onMouseEnter",["mouseout","mouseover"]);Sa("onMouseLeave",["mouseout","mouseover"]);Sa("onPointerEnter",["pointerout","pointerover"]);Sa("onPointerLeave",["pointerout","pointerover"]);zl("onChange","change click focusin focusout input keydown keyup selectionchange".split(" "));zl("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));zl("onBeforeInput",["compositionend","keypress","textInput","paste"]);zl("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" "));zl("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" "));zl("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));var Xo="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),jy=new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(Xo));function jm(t,e){e=(e&4)!==0;for(var n=0;n<t.length;n++){var l=t[n],a=l.event;l=l.listeners;t:{var o=void 0;if(e)for(var i=l.length-1;0<=i;i--){var s=l[i],u=s.instance,m=s.currentTarget;if(s=s.listener,u!==o&&a.isPropagationStopped())break t;o=s,a.currentTarget=m;try{o(a)}catch(h){ms(h)}a.currentTarget=null,o=u}else for(i=0;i<l.length;i++){if(s=l[i],u=s.instance,m=s.currentTarget,s=s.listener,u!==o&&a.isPropagationStopped())break t;o=s,a.currentTarget=m;try{o(a)}catch(h){ms(h)}a.currentTarget=null,o=u}}}}function et(t,e){var n=e[Lc];n===void 0&&(n=e[Lc]=new Set);var l=t+"__bubble";n.has(l)||(Xm(e,t,2,!1),n.add(l))}function bc(t,e,n){var l=0;e&&(l|=4),Xm(n,t,l,e)}var Gi="_reactListening"+Math.random().toString(36).slice(2);function sd(t){if(!t[Gi]){t[Gi]=!0,N1.forEach(function(n){n!=="selectionchange"&&(jy.has(n)||bc(n,!1,t),bc(n,!0,t))});var e=t.nodeType===9?t:t.ownerDocument;e===null||e[Gi]||(e[Gi]=!0,bc("selectionchange",!1,e))}}function Xm(t,e,n,l){switch(t5(e)){case 2:var a=mg;break;case 8:a=hg;break;default:a=dd}n=a.bind(null,e,n,t),a=void 0,!Yc||e!=="touchstart"&&e!=="touchmove"&&e!=="wheel"||(a=!0),l?a!==void 0?t.addEventListener(e,n,{capture:!0,passive:a}):t.addEventListener(e,n,!0):a!==void 0?t.addEventListener(e,n,{passive:a}):t.addEventListener(e,n,!1)}function vc(t,e,n,l,a){var o=l;if(!(e&1)&&!(e&2)&&l!==null)t:for(;;){if(l===null)return;var i=l.tag;if(i===3||i===4){var s=l.stateNode.containerInfo;if(s===a)break;if(i===4)for(i=l.return;i!==null;){var u=i.tag;if((u===3||u===4)&&i.stateNode.containerInfo===a)return;i=i.return}for(;s!==null;){if(i=oa(s),i===null)return;if(u=i.tag,u===5||u===6||u===26||u===27){l=o=i;continue t}s=s.parentNode}}l=l.return}j1(function(){var m=o,h=Er(n),v=[];t:{var g=e0.get(t);if(g!==void 0){var b=Us,T=t;switch(t){case"keypress":if(Ii(n)===0)break t;case"keydown":case"keyup":b=Bh;break;case"focusin":T="focus",b=Fu;break;case"focusout":T="blur",b=Fu;break;case"beforeblur":case"afterblur":b=Fu;break;case"click":if(n.button===2)break t;case"auxclick":case"dblclick":case"mousedown":case"mousemove":case"mouseup":case"mouseout":case"mouseover":case"contextmenu":b=nf;break;case"drag":case"dragend":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"dragstart":case"drop":b=Sh;break;case"touchcancel":case"touchend":case"touchmove":case"touchstart":b=Rh;break;case I1:case F1:case P1:b=Th;break;case t0:b=jh;break;case"scroll":case"scrollend":b=xh;break;case"wheel":b=Qh;break;case"copy":case"cut":case"paste":b=kh;break;case"gotpointercapture":case"lostpointercapture":case"pointercancel":case"pointerdown":case"pointermove":case"pointerout":case"pointerover":case"pointerup":b=af;break;case"toggle":case"beforetoggle":b=Zh}var O=(e&4)!==0,L=!O&&(t==="scroll"||t==="scrollend"),f=O?g!==null?g+"Capture":null:g;O=[];for(var _=m,p;_!==null;){var C=_;if(p=C.stateNode,C=C.tag,C!==5&&C!==26&&C!==27||p===null||f===null||(C=Oo(_,f),C!=null&&O.push(Qo(_,C,p))),L)break;_=_.return}0<O.length&&(g=new b(g,T,null,n,h),v.push({event:g,listeners:O}))}}if(!(e&7)){t:{if(g=t==="mouseover"||t==="pointerover",b=t==="mouseout"||t==="pointerout",g&&n!==Bc&&(T=n.relatedTarget||n.fromElement)&&(oa(T)||T[Oa]))break t;if((b||g)&&(g=h.window===h?h:(g=h.ownerDocument)?g.defaultView||g.parentWindow:window,b?(T=n.relatedTarget||n.toElement,b=m,T=T?oa(T):null,T!==null&&(L=$o(T),O=T.tag,T!==L||O!==5&&O!==27&&O!==6)&&(T=null)):(b=null,T=m),b!==T)){if(O=nf,C="onMouseLeave",f="onMouseEnter",_="mouse",(t==="pointerout"||t==="pointerover")&&(O=af,C="onPointerLeave",f="onPointerEnter",_="pointer"),L=b==null?g:yo(b),p=T==null?g:yo(T),g=new O(C,_+"leave",b,n,h),g.target=L,g.relatedTarget=p,C=null,oa(h)===m&&(O=new O(f,_+"enter",T,n,h),O.target=p,O.relatedTarget=L,C=O),L=C,b&&T)e:{for(O=Xy,f=b,_=T,p=0,C=f;C;C=O(C))p++;C=0;for(var B=_;B;B=O(B))C++;for(;0<p-C;)f=O(f),p--;for(;0<C-p;)_=O(_),C--;for(;p--;){if(f===_||_!==null&&f===_.alternate){O=f;break e}f=O(f),_=O(_)}O=null}else O=null;b!==null&&If(v,g,b,O,!1),T!==null&&L!==null&&If(v,L,T,O,!0)}}t:{if(g=m?yo(m):window,b=g.nodeName&&g.nodeName.toLowerCase(),b==="select"||b==="input"&&g.type==="file")var X=cf;else if(uf(g))if($1)X=ty;else{X=Fh;var N=Ih}else b=g.nodeName,!b||b.toLowerCase()!=="input"||g.type!=="checkbox"&&g.type!=="radio"?m&&wr(m.elementType)&&(X=cf):X=Ph;if(X&&(X=X(t,m))){G1(v,X,n,h);break t}N&&N(t,g,m),t==="focusout"&&m&&g.type==="number"&&m.memoizedProps.value!=null&&Dc(g,"number",g.value)}switch(N=m?yo(m):window,t){case"focusin":(uf(N)||N.contentEditable==="true")&&(ua=N,Hc=m,xo=null);break;case"focusout":xo=Hc=ua=null;break;case"mousedown":Rc=!0;break;case"contextmenu":case"mouseup":case"dragend":Rc=!1,ff(v,n,h);break;case"selectionchange":if(ny)break;case"keydown":case"keyup":ff(v,n,h)}var H;if(kr)t:{switch(t){case"compositionstart":var G="onCompositionStart";break t;case"compositionend":G="onCompositionEnd";break t;case"compositionupdate":G="onCompositionUpdate";break t}G=void 0}else sa?q1(t,n)&&(G="onCompositionEnd"):t==="keydown"&&n.keyCode===229&&(G="onCompositionStart");G&&(Q1&&n.locale!=="ko"&&(sa||G!=="onCompositionStart"?G==="onCompositionEnd"&&sa&&(H=X1()):(Zn=h,Tr="value"in Zn?Zn.value:Zn.textContent,sa=!0)),N=Ls(m,G),0<N.length&&(G=new lf(G,t,null,n,h),v.push({event:G,listeners:N}),H?G.data=H:(H=Z1(n),H!==null&&(G.data=H)))),(H=$h?Vh(t,n):Kh(t,n))&&(G=Ls(m,"onBeforeInput"),0<G.length&&(N=new lf("onBeforeInput","beforeinput",null,n,h),v.push({event:N,listeners:G}),N.data=H)),Uy(v,t,m,n,h)}jm(v,e)})}function Qo(t,e,n){return{instance:t,listener:e,currentTarget:n}}function Ls(t,e){for(var n=e+"Capture",l=[];t!==null;){var a=t,o=a.stateNode;if(a=a.tag,a!==5&&a!==26&&a!==27||o===null||(a=Oo(t,n),a!=null&&l.unshift(Qo(t,a,o)),a=Oo(t,e),a!=null&&l.push(Qo(t,a,o))),t.tag===3)return l;t=t.return}return[]}function Xy(t){if(t===null)return null;do t=t.return;while(t&&t.tag!==5&&t.tag!==27);return t||null}function If(t,e,n,l,a){for(var o=e._reactName,i=[];n!==null&&n!==l;){var s=n,u=s.alternate,m=s.stateNode;if(s=s.tag,u!==null&&u===l)break;s!==5&&s!==26&&s!==27||m===null||(u=m,a?(m=Oo(n,o),m!=null&&i.unshift(Qo(n,m,u))):a||(m=Oo(n,o),m!=null&&i.push(Qo(n,m,u)))),n=n.return}i.length!==0&&t.push({event:e,listeners:i})}var Qy=/\r\n?/g,qy=/\u0000|\uFFFD/g;function Ff(t){return(typeof t=="string"?t:""+t).replace(Qy,`
`).replace(qy,"")}function Qm(t,e){return e=Ff(e),Ff(t)===e}function ft(t,e,n,l,a,o){switch(n){case"children":typeof l=="string"?e==="body"||e==="textarea"&&l===""||wa(t,l):(typeof l=="number"||typeof l=="bigint")&&e!=="body"&&wa(t,""+l);break;case"className":Di(t,"class",l);break;case"tabIndex":Di(t,"tabindex",l);break;case"dir":case"role":case"viewBox":case"width":case"height":Di(t,n,l);break;case"style":U1(t,l,o);break;case"data":if(e!=="object"){Di(t,"data",l);break}case"src":case"href":if(l===""&&(e!=="a"||n!=="href")){t.removeAttribute(n);break}if(l==null||typeof l=="function"||typeof l=="symbol"||typeof l=="boolean"){t.removeAttribute(n);break}l=Ji(""+l),t.setAttribute(n,l);break;case"action":case"formAction":if(typeof l=="function"){t.setAttribute(n,"javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");break}else typeof o=="function"&&(n==="formAction"?(e!=="input"&&ft(t,e,"name",a.name,a,null),ft(t,e,"formEncType",a.formEncType,a,null),ft(t,e,"formMethod",a.formMethod,a,null),ft(t,e,"formTarget",a.formTarget,a,null)):(ft(t,e,"encType",a.encType,a,null),ft(t,e,"method",a.method,a,null),ft(t,e,"target",a.target,a,null)));if(l==null||typeof l=="symbol"||typeof l=="boolean"){t.removeAttribute(n);break}l=Ji(""+l),t.setAttribute(n,l);break;case"onClick":l!=null&&(t.onclick=xn);break;case"onScroll":l!=null&&et("scroll",t);break;case"onScrollEnd":l!=null&&et("scrollend",t);break;case"dangerouslySetInnerHTML":if(l!=null){if(typeof l!="object"||!("__html"in l))throw Error(w(61));if(n=l.__html,n!=null){if(a.children!=null)throw Error(w(60));t.innerHTML=n}}break;case"multiple":t.multiple=l&&typeof l!="function"&&typeof l!="symbol";break;case"muted":t.muted=l&&typeof l!="function"&&typeof l!="symbol";break;case"suppressContentEditableWarning":case"suppressHydrationWarning":case"defaultValue":case"defaultChecked":case"innerHTML":case"ref":break;case"autoFocus":break;case"xlinkHref":if(l==null||typeof l=="function"||typeof l=="boolean"||typeof l=="symbol"){t.removeAttribute("xlink:href");break}n=Ji(""+l),t.setAttributeNS("http://www.w3.org/1999/xlink","xlink:href",n);break;case"contentEditable":case"spellCheck":case"draggable":case"value":case"autoReverse":case"externalResourcesRequired":case"focusable":case"preserveAlpha":l!=null&&typeof l!="function"&&typeof l!="symbol"?t.setAttribute(n,""+l):t.removeAttribute(n);break;case"inert":case"allowFullScreen":case"async":case"autoPlay":case"controls":case"default":case"defer":case"disabled":case"disablePictureInPicture":case"disableRemotePlayback":case"formNoValidate":case"hidden":case"loop":case"noModule":case"noValidate":case"open":case"playsInline":case"readOnly":case"required":case"reversed":case"scoped":case"seamless":case"itemScope":l&&typeof l!="function"&&typeof l!="symbol"?t.setAttribute(n,""):t.removeAttribute(n);break;case"capture":case"download":l===!0?t.setAttribute(n,""):l!==!1&&l!=null&&typeof l!="function"&&typeof l!="symbol"?t.setAttribute(n,l):t.removeAttribute(n);break;case"cols":case"rows":case"size":case"span":l!=null&&typeof l!="function"&&typeof l!="symbol"&&!isNaN(l)&&1<=l?t.setAttribute(n,l):t.removeAttribute(n);break;case"rowSpan":case"start":l==null||typeof l=="function"||typeof l=="symbol"||isNaN(l)?t.removeAttribute(n):t.setAttribute(n,l);break;case"popover":et("beforetoggle",t),et("toggle",t),Ki(t,"popover",l);break;case"xlinkActuate":fn(t,"http://www.w3.org/1999/xlink","xlink:actuate",l);break;case"xlinkArcrole":fn(t,"http://www.w3.org/1999/xlink","xlink:arcrole",l);break;case"xlinkRole":fn(t,"http://www.w3.org/1999/xlink","xlink:role",l);break;case"xlinkShow":fn(t,"http://www.w3.org/1999/xlink","xlink:show",l);break;case"xlinkTitle":fn(t,"http://www.w3.org/1999/xlink","xlink:title",l);break;case"xlinkType":fn(t,"http://www.w3.org/1999/xlink","xlink:type",l);break;case"xmlBase":fn(t,"http://www.w3.org/XML/1998/namespace","xml:base",l);break;case"xmlLang":fn(t,"http://www.w3.org/XML/1998/namespace","xml:lang",l);break;case"xmlSpace":fn(t,"http://www.w3.org/XML/1998/namespace","xml:space",l);break;case"is":Ki(t,"is",l);break;case"innerText":case"textContent":break;default:(!(2<n.length)||n[0]!=="o"&&n[0]!=="O"||n[1]!=="n"&&n[1]!=="N")&&(n=bh.get(n)||n,Ki(t,n,l))}}function ur(t,e,n,l,a,o){switch(n){case"style":U1(t,l,o);break;case"dangerouslySetInnerHTML":if(l!=null){if(typeof l!="object"||!("__html"in l))throw Error(w(61));if(n=l.__html,n!=null){if(a.children!=null)throw Error(w(60));t.innerHTML=n}}break;case"children":typeof l=="string"?wa(t,l):(typeof l=="number"||typeof l=="bigint")&&wa(t,""+l);break;case"onScroll":l!=null&&et("scroll",t);break;case"onScrollEnd":l!=null&&et("scrollend",t);break;case"onClick":l!=null&&(t.onclick=xn);break;case"suppressContentEditableWarning":case"suppressHydrationWarning":case"innerHTML":case"ref":break;case"innerText":case"textContent":break;default:if(!O1.hasOwnProperty(n))t:{if(n[0]==="o"&&n[1]==="n"&&(a=n.endsWith("Capture"),e=n.slice(2,a?n.length-7:void 0),o=t[_e]||null,o=o!=null?o[n]:null,typeof o=="function"&&t.removeEventListener(e,o,a),typeof l=="function")){typeof o!="function"&&o!==null&&(n in t?t[n]=null:t.hasAttribute(n)&&t.removeAttribute(n)),t.addEventListener(e,l,a);break t}n in t?t[n]=l:l===!0?t.setAttribute(n,""):Ki(t,n,l)}}}function It(t,e,n){switch(e){case"div":case"span":case"svg":case"path":case"a":case"g":case"p":case"li":break;case"img":et("error",t),et("load",t);var l=!1,a=!1,o;for(o in n)if(n.hasOwnProperty(o)){var i=n[o];if(i!=null)switch(o){case"src":l=!0;break;case"srcSet":a=!0;break;case"children":case"dangerouslySetInnerHTML":throw Error(w(137,e));default:ft(t,e,o,i,n,null)}}a&&ft(t,e,"srcSet",n.srcSet,n,null),l&&ft(t,e,"src",n.src,n,null);return;case"input":et("invalid",t);var s=o=i=a=null,u=null,m=null;for(l in n)if(n.hasOwnProperty(l)){var h=n[l];if(h!=null)switch(l){case"name":a=h;break;case"type":i=h;break;case"checked":u=h;break;case"defaultChecked":m=h;break;case"value":o=h;break;case"defaultValue":s=h;break;case"children":case"dangerouslySetInnerHTML":if(h!=null)throw Error(w(137,e));break;default:ft(t,e,l,h,n,null)}}Y1(t,o,s,u,m,i,a,!1);return;case"select":et("invalid",t),l=i=o=null;for(a in n)if(n.hasOwnProperty(a)&&(s=n[a],s!=null))switch(a){case"value":o=s;break;case"defaultValue":i=s;break;case"multiple":l=s;default:ft(t,e,a,s,n,null)}e=o,n=i,t.multiple=!!l,e!=null?ya(t,!!l,e,!1):n!=null&&ya(t,!!l,n,!0);return;case"textarea":et("invalid",t),o=a=l=null;for(i in n)if(n.hasOwnProperty(i)&&(s=n[i],s!=null))switch(i){case"value":l=s;break;case"defaultValue":a=s;break;case"children":o=s;break;case"dangerouslySetInnerHTML":if(s!=null)throw Error(w(91));break;default:ft(t,e,i,s,n,null)}R1(t,l,a,o);return;case"option":for(u in n)if(n.hasOwnProperty(u)&&(l=n[u],l!=null))switch(u){case"selected":t.selected=l&&typeof l!="function"&&typeof l!="symbol";break;default:ft(t,e,u,l,n,null)}return;case"dialog":et("beforetoggle",t),et("toggle",t),et("cancel",t),et("close",t);break;case"iframe":case"object":et("load",t);break;case"video":case"audio":for(l=0;l<Xo.length;l++)et(Xo[l],t);break;case"image":et("error",t),et("load",t);break;case"details":et("toggle",t);break;case"embed":case"source":case"link":et("error",t),et("load",t);case"area":case"base":case"br":case"col":case"hr":case"keygen":case"meta":case"param":case"track":case"wbr":case"menuitem":for(m in n)if(n.hasOwnProperty(m)&&(l=n[m],l!=null))switch(m){case"children":case"dangerouslySetInnerHTML":throw Error(w(137,e));default:ft(t,e,m,l,n,null)}return;default:if(wr(e)){for(h in n)n.hasOwnProperty(h)&&(l=n[h],l!==void 0&&ur(t,e,h,l,n,void 0));return}}for(s in n)n.hasOwnProperty(s)&&(l=n[s],l!=null&&ft(t,e,s,l,n,null))}function Zy(t,e,n,l){switch(e){case"div":case"span":case"svg":case"path":case"a":case"g":case"p":case"li":break;case"input":var a=null,o=null,i=null,s=null,u=null,m=null,h=null;for(b in n){var v=n[b];if(n.hasOwnProperty(b)&&v!=null)switch(b){case"checked":break;case"value":break;case"defaultValue":u=v;default:l.hasOwnProperty(b)||ft(t,e,b,null,l,v)}}for(var g in l){var b=l[g];if(v=n[g],l.hasOwnProperty(g)&&(b!=null||v!=null))switch(g){case"type":o=b;break;case"name":a=b;break;case"checked":m=b;break;case"defaultChecked":h=b;break;case"value":i=b;break;case"defaultValue":s=b;break;case"children":case"dangerouslySetInnerHTML":if(b!=null)throw Error(w(137,e));break;default:b!==v&&ft(t,e,g,b,l,v)}}Oc(t,i,s,u,m,h,o,a);return;case"select":b=i=s=g=null;for(o in n)if(u=n[o],n.hasOwnProperty(o)&&u!=null)switch(o){case"value":break;case"multiple":b=u;default:l.hasOwnProperty(o)||ft(t,e,o,null,l,u)}for(a in l)if(o=l[a],u=n[a],l.hasOwnProperty(a)&&(o!=null||u!=null))switch(a){case"value":g=o;break;case"defaultValue":s=o;break;case"multiple":i=o;default:o!==u&&ft(t,e,a,o,l,u)}e=s,n=i,l=b,g!=null?ya(t,!!n,g,!1):!!l!=!!n&&(e!=null?ya(t,!!n,e,!0):ya(t,!!n,n?[]:"",!1));return;case"textarea":b=g=null;for(s in n)if(a=n[s],n.hasOwnProperty(s)&&a!=null&&!l.hasOwnProperty(s))switch(s){case"value":break;case"children":break;default:ft(t,e,s,null,l,a)}for(i in l)if(a=l[i],o=n[i],l.hasOwnProperty(i)&&(a!=null||o!=null))switch(i){case"value":g=a;break;case"defaultValue":b=a;break;case"children":break;case"dangerouslySetInnerHTML":if(a!=null)throw Error(w(91));break;default:a!==o&&ft(t,e,i,a,l,o)}H1(t,g,b);return;case"option":for(var T in n)if(g=n[T],n.hasOwnProperty(T)&&g!=null&&!l.hasOwnProperty(T))switch(T){case"selected":t.selected=!1;break;default:ft(t,e,T,null,l,g)}for(u in l)if(g=l[u],b=n[u],l.hasOwnProperty(u)&&g!==b&&(g!=null||b!=null))switch(u){case"selected":t.selected=g&&typeof g!="function"&&typeof g!="symbol";break;default:ft(t,e,u,g,l,b)}return;case"img":case"link":case"area":case"base":case"br":case"col":case"embed":case"hr":case"keygen":case"meta":case"param":case"source":case"track":case"wbr":case"menuitem":for(var O in n)g=n[O],n.hasOwnProperty(O)&&g!=null&&!l.hasOwnProperty(O)&&ft(t,e,O,null,l,g);for(m in l)if(g=l[m],b=n[m],l.hasOwnProperty(m)&&g!==b&&(g!=null||b!=null))switch(m){case"children":case"dangerouslySetInnerHTML":if(g!=null)throw Error(w(137,e));break;default:ft(t,e,m,g,l,b)}return;default:if(wr(e)){for(var L in n)g=n[L],n.hasOwnProperty(L)&&g!==void 0&&!l.hasOwnProperty(L)&&ur(t,e,L,void 0,l,g);for(h in l)g=l[h],b=n[h],!l.hasOwnProperty(h)||g===b||g===void 0&&b===void 0||ur(t,e,h,g,l,b);return}}for(var f in n)g=n[f],n.hasOwnProperty(f)&&g!=null&&!l.hasOwnProperty(f)&&ft(t,e,f,null,l,g);for(v in l)g=l[v],b=n[v],!l.hasOwnProperty(v)||g===b||g==null&&b==null||ft(t,e,v,g,l,b)}function Pf(t){switch(t){case"css":case"script":case"font":case"img":case"image":case"input":case"link":return!0;default:return!1}}function Gy(){if(typeof performance.getEntriesByType=="function"){for(var t=0,e=0,n=performance.getEntriesByType("resource"),l=0;l<n.length;l++){var a=n[l],o=a.transferSize,i=a.initiatorType,s=a.duration;if(o&&s&&Pf(i)){for(i=0,s=a.responseEnd,l+=1;l<n.length;l++){var u=n[l],m=u.startTime;if(m>s)break;var h=u.transferSize,v=u.initiatorType;h&&Pf(v)&&(u=u.responseEnd,i+=h*(u<s?1:(s-m)/(u-m)))}if(--l,e+=8*(o+i)/(a.duration/1e3),t++,10<t)break}}if(0<t)return e/t/1e6}return navigator.connection&&(t=navigator.connection.downlink,typeof t=="number")?t:5}var cr=null,rr=null;function Ns(t){return t.nodeType===9?t:t.ownerDocument}function t1(t){switch(t){case"http://www.w3.org/2000/svg":return 1;case"http://www.w3.org/1998/Math/MathML":return 2;default:return 0}}function qm(t,e){if(t===0)switch(e){case"svg":return 1;case"math":return 2;default:return 0}return t===1&&e==="foreignObject"?0:t}function dr(t,e){return t==="textarea"||t==="noscript"||typeof e.children=="string"||typeof e.children=="number"||typeof e.children=="bigint"||typeof e.dangerouslySetInnerHTML=="object"&&e.dangerouslySetInnerHTML!==null&&e.dangerouslySetInnerHTML.__html!=null}var xc=null;function $y(){var t=window.event;return t&&t.type==="popstate"?t===xc?!1:(xc=t,!0):(xc=null,!1)}var Zm=typeof setTimeout=="function"?setTimeout:void 0,Vy=typeof clearTimeout=="function"?clearTimeout:void 0,e1=typeof Promise=="function"?Promise:void 0,Ky=typeof queueMicrotask=="function"?queueMicrotask:typeof e1<"u"?function(t){return e1.resolve(null).then(t).catch(Jy)}:Zm;function Jy(t){setTimeout(function(){throw t})}function ul(t){return t==="head"}function n1(t,e){var n=e,l=0;do{var a=n.nextSibling;if(t.removeChild(n),a&&a.nodeType===8)if(n=a.data,n==="/$"||n==="/&"){if(l===0){t.removeChild(a),Na(e);return}l--}else if(n==="$"||n==="$?"||n==="$~"||n==="$!"||n==="&")l++;else if(n==="html")Lo(t.ownerDocument.documentElement);else if(n==="head"){n=t.ownerDocument.head,Lo(n);for(var o=n.firstChild;o;){var i=o.nextSibling,s=o.nodeName;o[Wo]||s==="SCRIPT"||s==="STYLE"||s==="LINK"&&o.rel.toLowerCase()==="stylesheet"||n.removeChild(o),o=i}}else n==="body"&&Lo(t.ownerDocument.body);n=a}while(n);Na(e)}function l1(t,e){var n=t;t=0;do{var l=n.nextSibling;if(n.nodeType===1?e?(n._stashedDisplay=n.style.display,n.style.display="none"):(n.style.display=n._stashedDisplay||"",n.getAttribute("style")===""&&n.removeAttribute("style")):n.nodeType===3&&(e?(n._stashedText=n.nodeValue,n.nodeValue=""):n.nodeValue=n._stashedText||""),l&&l.nodeType===8)if(n=l.data,n==="/$"){if(t===0)break;t--}else n!=="$"&&n!=="$?"&&n!=="$~"&&n!=="$!"||t++;n=l}while(n)}function _r(t){var e=t.firstChild;for(e&&e.nodeType===10&&(e=e.nextSibling);e;){var n=e;switch(e=e.nextSibling,n.nodeName){case"HTML":case"HEAD":case"BODY":_r(n),Sr(n);continue;case"SCRIPT":case"STYLE":continue;case"LINK":if(n.rel.toLowerCase()==="stylesheet")continue}t.removeChild(n)}}function Wy(t,e,n,l){for(;t.nodeType===1;){var a=n;if(t.nodeName.toLowerCase()!==e.toLowerCase()){if(!l&&(t.nodeName!=="INPUT"||t.type!=="hidden"))break}else if(l){if(!t[Wo])switch(e){case"meta":if(!t.hasAttribute("itemprop"))break;return t;case"link":if(o=t.getAttribute("rel"),o==="stylesheet"&&t.hasAttribute("data-precedence"))break;if(o!==a.rel||t.getAttribute("href")!==(a.href==null||a.href===""?null:a.href)||t.getAttribute("crossorigin")!==(a.crossOrigin==null?null:a.crossOrigin)||t.getAttribute("title")!==(a.title==null?null:a.title))break;return t;case"style":if(t.hasAttribute("data-precedence"))break;return t;case"script":if(o=t.getAttribute("src"),(o!==(a.src==null?null:a.src)||t.getAttribute("type")!==(a.type==null?null:a.type)||t.getAttribute("crossorigin")!==(a.crossOrigin==null?null:a.crossOrigin))&&o&&t.hasAttribute("async")&&!t.hasAttribute("itemprop"))break;return t;default:return t}}else if(e==="input"&&t.type==="hidden"){var o=a.name==null?null:""+a.name;if(a.type==="hidden"&&t.getAttribute("name")===o)return t}else return t;if(t=je(t.nextSibling),t===null)break}return null}function Iy(t,e,n){if(e==="")return null;for(;t.nodeType!==3;)if((t.nodeType!==1||t.nodeName!=="INPUT"||t.type!=="hidden")&&!n||(t=je(t.nextSibling),t===null))return null;return t}function Gm(t,e){for(;t.nodeType!==8;)if((t.nodeType!==1||t.nodeName!=="INPUT"||t.type!=="hidden")&&!e||(t=je(t.nextSibling),t===null))return null;return t}function fr(t){return t.data==="$?"||t.data==="$~"}function mr(t){return t.data==="$!"||t.data==="$?"&&t.ownerDocument.readyState!=="loading"}function Fy(t,e){var n=t.ownerDocument;if(t.data==="$~")t._reactRetry=e;else if(t.data!=="$?"||n.readyState!=="loading")e();else{var l=function(){e(),n.removeEventListener("DOMContentLoaded",l)};n.addEventListener("DOMContentLoaded",l),t._reactRetry=l}}function je(t){for(;t!=null;t=t.nextSibling){var e=t.nodeType;if(e===1||e===3)break;if(e===8){if(e=t.data,e==="$"||e==="$!"||e==="$?"||e==="$~"||e==="&"||e==="F!"||e==="F")break;if(e==="/$"||e==="/&")return null}}return t}var hr=null;function a1(t){t=t.nextSibling;for(var e=0;t;){if(t.nodeType===8){var n=t.data;if(n==="/$"||n==="/&"){if(e===0)return je(t.nextSibling);e--}else n!=="$"&&n!=="$!"&&n!=="$?"&&n!=="$~"&&n!=="&"||e++}t=t.nextSibling}return null}function o1(t){t=t.previousSibling;for(var e=0;t;){if(t.nodeType===8){var n=t.data;if(n==="$"||n==="$!"||n==="$?"||n==="$~"||n==="&"){if(e===0)return t;e--}else n!=="/$"&&n!=="/&"||e++}t=t.previousSibling}return null}function $m(t,e,n){switch(e=Ns(n),t){case"html":if(t=e.documentElement,!t)throw Error(w(452));return t;case"head":if(t=e.head,!t)throw Error(w(453));return t;case"body":if(t=e.body,!t)throw Error(w(454));return t;default:throw Error(w(451))}}function Lo(t){for(var e=t.attributes;e.length;)t.removeAttributeNode(e[0]);Sr(t)}var Xe=new Map,i1=new Set;function Os(t){return typeof t.getRootNode=="function"?t.getRootNode():t.nodeType===9?t:t.ownerDocument}var Ln=rt.d;rt.d={f:Py,r:tg,D:eg,C:ng,L:lg,m:ag,X:ig,S:og,M:sg};function Py(){var t=Ln.f(),e=Ws();return t||e}function tg(t){var e=Da(t);e!==null&&e.tag===5&&e.type==="form"?U0(e):Ln.r(t)}var Ra=typeof document>"u"?null:document;function Vm(t,e,n){var l=Ra;if(l&&typeof e=="string"&&e){var a=Ye(e);a='link[rel="'+t+'"][href="'+a+'"]',typeof n=="string"&&(a+='[crossorigin="'+n+'"]'),i1.has(a)||(i1.add(a),t={rel:t,crossOrigin:n,href:e},l.querySelector(a)===null&&(e=l.createElement("link"),It(e,"link",t),Gt(e),l.head.appendChild(e)))}}function eg(t){Ln.D(t),Vm("dns-prefetch",t,null)}function ng(t,e){Ln.C(t,e),Vm("preconnect",t,e)}function lg(t,e,n){Ln.L(t,e,n);var l=Ra;if(l&&t&&e){var a='link[rel="preload"][as="'+Ye(e)+'"]';e==="image"&&n&&n.imageSrcSet?(a+='[imagesrcset="'+Ye(n.imageSrcSet)+'"]',typeof n.imageSizes=="string"&&(a+='[imagesizes="'+Ye(n.imageSizes)+'"]')):a+='[href="'+Ye(t)+'"]';var o=a;switch(e){case"style":o=La(t);break;case"script":o=Ua(t)}Xe.has(o)||(t=Ct({rel:"preload",href:e==="image"&&n&&n.imageSrcSet?void 0:t,as:e},n),Xe.set(o,t),l.querySelector(a)!==null||e==="style"&&l.querySelector(ni(o))||e==="script"&&l.querySelector(li(o))||(e=l.createElement("link"),It(e,"link",t),Gt(e),l.head.appendChild(e)))}}function ag(t,e){Ln.m(t,e);var n=Ra;if(n&&t){var l=e&&typeof e.as=="string"?e.as:"script",a='link[rel="modulepreload"][as="'+Ye(l)+'"][href="'+Ye(t)+'"]',o=a;switch(l){case"audioworklet":case"paintworklet":case"serviceworker":case"sharedworker":case"worker":case"script":o=Ua(t)}if(!Xe.has(o)&&(t=Ct({rel:"modulepreload",href:t},e),Xe.set(o,t),n.querySelector(a)===null)){switch(l){case"audioworklet":case"paintworklet":case"serviceworker":case"sharedworker":case"worker":case"script":if(n.querySelector(li(o)))return}l=n.createElement("link"),It(l,"link",t),Gt(l),n.head.appendChild(l)}}}function og(t,e,n){Ln.S(t,e,n);var l=Ra;if(l&&t){var a=ha(l).hoistableStyles,o=La(t);e=e||"default";var i=a.get(o);if(!i){var s={loading:0,preload:null};if(i=l.querySelector(ni(o)))s.loading=5;else{t=Ct({rel:"stylesheet",href:t,"data-precedence":e},n),(n=Xe.get(o))&&ud(t,n);var u=i=l.createElement("link");Gt(u),It(u,"link",t),u._p=new Promise(function(m,h){u.onload=m,u.onerror=h}),u.addEventListener("load",function(){s.loading|=1}),u.addEventListener("error",function(){s.loading|=2}),s.loading|=4,os(i,e,l)}i={type:"stylesheet",instance:i,count:1,state:s},a.set(o,i)}}}function ig(t,e){Ln.X(t,e);var n=Ra;if(n&&t){var l=ha(n).hoistableScripts,a=Ua(t),o=l.get(a);o||(o=n.querySelector(li(a)),o||(t=Ct({src:t,async:!0},e),(e=Xe.get(a))&&cd(t,e),o=n.createElement("script"),Gt(o),It(o,"link",t),n.head.appendChild(o)),o={type:"script",instance:o,count:1,state:null},l.set(a,o))}}function sg(t,e){Ln.M(t,e);var n=Ra;if(n&&t){var l=ha(n).hoistableScripts,a=Ua(t),o=l.get(a);o||(o=n.querySelector(li(a)),o||(t=Ct({src:t,async:!0,type:"module"},e),(e=Xe.get(a))&&cd(t,e),o=n.createElement("script"),Gt(o),It(o,"link",t),n.head.appendChild(o)),o={type:"script",instance:o,count:1,state:null},l.set(a,o))}}function s1(t,e,n,l){var a=(a=Kn.current)?Os(a):null;if(!a)throw Error(w(446));switch(t){case"meta":case"title":return null;case"style":return typeof n.precedence=="string"&&typeof n.href=="string"?(e=La(n.href),n=ha(a).hoistableStyles,l=n.get(e),l||(l={type:"style",instance:null,count:0,state:null},n.set(e,l)),l):{type:"void",instance:null,count:0,state:null};case"link":if(n.rel==="stylesheet"&&typeof n.href=="string"&&typeof n.precedence=="string"){t=La(n.href);var o=ha(a).hoistableStyles,i=o.get(t);if(i||(a=a.ownerDocument||a,i={type:"stylesheet",instance:null,count:0,state:{loading:0,preload:null}},o.set(t,i),(o=a.querySelector(ni(t)))&&!o._p&&(i.instance=o,i.state.loading=5),Xe.has(t)||(n={rel:"preload",as:"style",href:n.href,crossOrigin:n.crossOrigin,integrity:n.integrity,media:n.media,hrefLang:n.hrefLang,referrerPolicy:n.referrerPolicy},Xe.set(t,n),o||ug(a,t,n,i.state))),e&&l===null)throw Error(w(528,""));return i}if(e&&l!==null)throw Error(w(529,""));return null;case"script":return e=n.async,n=n.src,typeof n=="string"&&e&&typeof e!="function"&&typeof e!="symbol"?(e=Ua(n),n=ha(a).hoistableScripts,l=n.get(e),l||(l={type:"script",instance:null,count:0,state:null},n.set(e,l)),l):{type:"void",instance:null,count:0,state:null};default:throw Error(w(444,t))}}function La(t){return'href="'+Ye(t)+'"'}function ni(t){return'link[rel="stylesheet"]['+t+"]"}function Km(t){return Ct({},t,{"data-precedence":t.precedence,precedence:null})}function ug(t,e,n,l){t.querySelector('link[rel="preload"][as="style"]['+e+"]")?l.loading=1:(e=t.createElement("link"),l.preload=e,e.addEventListener("load",function(){return l.loading|=1}),e.addEventListener("error",function(){return l.loading|=2}),It(e,"link",n),Gt(e),t.head.appendChild(e))}function Ua(t){return'[src="'+Ye(t)+'"]'}function li(t){return"script[async]"+t}function u1(t,e,n){if(e.count++,e.instance===null)switch(e.type){case"style":var l=t.querySelector('style[data-href~="'+Ye(n.href)+'"]');if(l)return e.instance=l,Gt(l),l;var a=Ct({},n,{"data-href":n.href,"data-precedence":n.precedence,href:null,precedence:null});return l=(t.ownerDocument||t).createElement("style"),Gt(l),It(l,"style",a),os(l,n.precedence,t),e.instance=l;case"stylesheet":a=La(n.href);var o=t.querySelector(ni(a));if(o)return e.state.loading|=4,e.instance=o,Gt(o),o;l=Km(n),(a=Xe.get(a))&&ud(l,a),o=(t.ownerDocument||t).createElement("link"),Gt(o);var i=o;return i._p=new Promise(function(s,u){i.onload=s,i.onerror=u}),It(o,"link",l),e.state.loading|=4,os(o,n.precedence,t),e.instance=o;case"script":return o=Ua(n.src),(a=t.querySelector(li(o)))?(e.instance=a,Gt(a),a):(l=n,(a=Xe.get(o))&&(l=Ct({},n),cd(l,a)),t=t.ownerDocument||t,a=t.createElement("script"),Gt(a),It(a,"link",l),t.head.appendChild(a),e.instance=a);case"void":return null;default:throw Error(w(443,e.type))}else e.type==="stylesheet"&&!(e.state.loading&4)&&(l=e.instance,e.state.loading|=4,os(l,n.precedence,t));return e.instance}function os(t,e,n){for(var l=n.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'),a=l.length?l[l.length-1]:null,o=a,i=0;i<l.length;i++){var s=l[i];if(s.dataset.precedence===e)o=s;else if(o!==a)break}o?o.parentNode.insertBefore(t,o.nextSibling):(e=n.nodeType===9?n.head:n,e.insertBefore(t,e.firstChild))}function ud(t,e){t.crossOrigin==null&&(t.crossOrigin=e.crossOrigin),t.referrerPolicy==null&&(t.referrerPolicy=e.referrerPolicy),t.title==null&&(t.title=e.title)}function cd(t,e){t.crossOrigin==null&&(t.crossOrigin=e.crossOrigin),t.referrerPolicy==null&&(t.referrerPolicy=e.referrerPolicy),t.integrity==null&&(t.integrity=e.integrity)}var is=null;function c1(t,e,n){if(is===null){var l=new Map,a=is=new Map;a.set(n,l)}else a=is,l=a.get(n),l||(l=new Map,a.set(n,l));if(l.has(t))return l;for(l.set(t,null),n=n.getElementsByTagName(t),a=0;a<n.length;a++){var o=n[a];if(!(o[Wo]||o[Kt]||t==="link"&&o.getAttribute("rel")==="stylesheet")&&o.namespaceURI!=="http://www.w3.org/2000/svg"){var i=o.getAttribute(e)||"";i=t+i;var s=l.get(i);s?s.push(o):l.set(i,[o])}}return l}function r1(t,e,n){t=t.ownerDocument||t,t.head.insertBefore(n,e==="title"?t.querySelector("head > title"):null)}function cg(t,e,n){if(n===1||e.itemProp!=null)return!1;switch(t){case"meta":case"title":return!0;case"style":if(typeof e.precedence!="string"||typeof e.href!="string"||e.href==="")break;return!0;case"link":if(typeof e.rel!="string"||typeof e.href!="string"||e.href===""||e.onLoad||e.onError)break;switch(e.rel){case"stylesheet":return t=e.disabled,typeof e.precedence=="string"&&t==null;default:return!0}case"script":if(e.async&&typeof e.async!="function"&&typeof e.async!="symbol"&&!e.onLoad&&!e.onError&&e.src&&typeof e.src=="string")return!0}return!1}function Jm(t){return!(t.type==="stylesheet"&&!(t.state.loading&3))}function rg(t,e,n,l){if(n.type==="stylesheet"&&(typeof l.media!="string"||matchMedia(l.media).matches!==!1)&&!(n.state.loading&4)){if(n.instance===null){var a=La(l.href),o=e.querySelector(ni(a));if(o){e=o._p,e!==null&&typeof e=="object"&&typeof e.then=="function"&&(t.count++,t=Ds.bind(t),e.then(t,t)),n.state.loading|=4,n.instance=o,Gt(o);return}o=e.ownerDocument||e,l=Km(l),(a=Xe.get(a))&&ud(l,a),o=o.createElement("link"),Gt(o);var i=o;i._p=new Promise(function(s,u){i.onload=s,i.onerror=u}),It(o,"link",l),n.instance=o}t.stylesheets===null&&(t.stylesheets=new Map),t.stylesheets.set(n,e),(e=n.state.preload)&&!(n.state.loading&3)&&(t.count++,n=Ds.bind(t),e.addEventListener("load",n),e.addEventListener("error",n))}}var Cc=0;function dg(t,e){return t.stylesheets&&t.count===0&&ss(t,t.stylesheets),0<t.count||0<t.imgCount?function(n){var l=setTimeout(function(){if(t.stylesheets&&ss(t,t.stylesheets),t.unsuspend){var o=t.unsuspend;t.unsuspend=null,o()}},6e4+e);0<t.imgBytes&&Cc===0&&(Cc=62500*Gy());var a=setTimeout(function(){if(t.waitingForImages=!1,t.count===0&&(t.stylesheets&&ss(t,t.stylesheets),t.unsuspend)){var o=t.unsuspend;t.unsuspend=null,o()}},(t.imgBytes>Cc?50:800)+e);return t.unsuspend=n,function(){t.unsuspend=null,clearTimeout(l),clearTimeout(a)}}:null}function Ds(){if(this.count--,this.count===0&&(this.imgCount===0||!this.waitingForImages)){if(this.stylesheets)ss(this,this.stylesheets);else if(this.unsuspend){var t=this.unsuspend;this.unsuspend=null,t()}}}var Bs=null;function ss(t,e){t.stylesheets=null,t.unsuspend!==null&&(t.count++,Bs=new Map,e.forEach(_g,t),Bs=null,Ds.call(t))}function _g(t,e){if(!(e.state.loading&4)){var n=Bs.get(t);if(n)var l=n.get(null);else{n=new Map,Bs.set(t,n);for(var a=t.querySelectorAll("link[data-precedence],style[data-precedence]"),o=0;o<a.length;o++){var i=a[o];(i.nodeName==="LINK"||i.getAttribute("media")!=="not all")&&(n.set(i.dataset.precedence,i),l=i)}l&&n.set(null,l)}a=e.instance,i=a.getAttribute("data-precedence"),o=n.get(i)||l,o===l&&n.set(null,a),n.set(i,a),this.count++,l=Ds.bind(this),a.addEventListener("load",l),a.addEventListener("error",l),o?o.parentNode.insertBefore(a,o.nextSibling):(t=t.nodeType===9?t.head:t,t.insertBefore(a,t.firstChild)),e.state.loading|=4}}var qo={$$typeof:vn,Provider:null,Consumer:null,_currentValue:vl,_currentValue2:vl,_threadCount:0};function fg(t,e,n,l,a,o,i,s,u){this.tag=1,this.containerInfo=t,this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.next=this.pendingContext=this.context=this.cancelPendingCommit=null,this.callbackPriority=0,this.expirationTimes=Ku(-1),this.entangledLanes=this.shellSuspendCounter=this.errorRecoveryDisabledLanes=this.expiredLanes=this.warmLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=Ku(0),this.hiddenUpdates=Ku(null),this.identifierPrefix=l,this.onUncaughtError=a,this.onCaughtError=o,this.onRecoverableError=i,this.pooledCache=null,this.pooledCacheLanes=0,this.formState=u,this.incompleteTransitions=new Map}function Wm(t,e,n,l,a,o,i,s,u,m,h,v){return t=new fg(t,e,n,i,u,m,h,v,s),e=1,o===!0&&(e|=24),o=ve(3,null,null,e),t.current=o,o.stateNode=t,e=Br(),e.refCount++,t.pooledCache=e,e.refCount++,o.memoizedState={element:l,isDehydrated:n,cache:e},Rr(o),t}function Im(t){return t?(t=da,t):da}function Fm(t,e,n,l,a,o){a=Im(a),l.context===null?l.context=a:l.pendingContext=a,l=Wn(e),l.payload={element:n},o=o===void 0?null:o,o!==null&&(l.callback=o),n=In(t,l,e),n!==null&&(de(n,t,e),So(n,t,e))}function d1(t,e){if(t=t.memoizedState,t!==null&&t.dehydrated!==null){var n=t.retryLane;t.retryLane=n!==0&&n<e?n:e}}function rd(t,e){d1(t,e),(t=t.alternate)&&d1(t,e)}function Pm(t){if(t.tag===13||t.tag===31){var e=Ol(t,67108864);e!==null&&de(e,t,67108864),rd(t,67108864)}}function _1(t){if(t.tag===13||t.tag===31){var e=Ee();e=xr(e);var n=Ol(t,e);n!==null&&de(n,t,e),rd(t,e)}}var Ys=!0;function mg(t,e,n,l){var a=Q.T;Q.T=null;var o=rt.p;try{rt.p=2,dd(t,e,n,l)}finally{rt.p=o,Q.T=a}}function hg(t,e,n,l){var a=Q.T;Q.T=null;var o=rt.p;try{rt.p=8,dd(t,e,n,l)}finally{rt.p=o,Q.T=a}}function dd(t,e,n,l){if(Ys){var a=yr(l);if(a===null)vc(t,e,l,Hs,n),f1(t,l);else if(gg(a,t,e,n,l))l.stopPropagation();else if(f1(t,l),e&4&&-1<yg.indexOf(t)){for(;a!==null;){var o=Da(a);if(o!==null)switch(o.tag){case 3:if(o=o.stateNode,o.current.memoizedState.isDehydrated){var i=gl(o.pendingLanes);if(i!==0){var s=o;for(s.pendingLanes|=2,s.entangledLanes|=2;i;){var u=1<<31-we(i);s.entanglements[1]|=u,i&=~u}an(o),!(ct&6)&&(Ts=Ce()+500,ei(0,!1))}}break;case 31:case 13:s=Ol(o,2),s!==null&&de(s,o,2),Ws(),rd(o,2)}if(o=yr(l),o===null&&vc(t,e,l,Hs,n),o===a)break;a=o}a!==null&&l.stopPropagation()}else vc(t,e,l,null,n)}}function yr(t){return t=Er(t),_d(t)}var Hs=null;function _d(t){if(Hs=null,t=oa(t),t!==null){var e=$o(t);if(e===null)t=null;else{var n=e.tag;if(n===13){if(t=b1(e),t!==null)return t;t=null}else if(n===31){if(t=v1(e),t!==null)return t;t=null}else if(n===3){if(e.stateNode.current.memoizedState.isDehydrated)return e.tag===3?e.stateNode.containerInfo:null;t=null}else e!==t&&(t=null)}}return Hs=t,null}function t5(t){switch(t){case"beforetoggle":case"cancel":case"click":case"close":case"contextmenu":case"copy":case"cut":case"auxclick":case"dblclick":case"dragend":case"dragstart":case"drop":case"focusin":case"focusout":case"input":case"invalid":case"keydown":case"keypress":case"keyup":case"mousedown":case"mouseup":case"paste":case"pause":case"play":case"pointercancel":case"pointerdown":case"pointerup":case"ratechange":case"reset":case"resize":case"seeked":case"submit":case"toggle":case"touchcancel":case"touchend":case"touchstart":case"volumechange":case"change":case"selectionchange":case"textInput":case"compositionstart":case"compositionend":case"compositionupdate":case"beforeblur":case"afterblur":case"beforeinput":case"blur":case"fullscreenchange":case"focus":case"hashchange":case"popstate":case"select":case"selectstart":return 2;case"drag":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"mousemove":case"mouseout":case"mouseover":case"pointermove":case"pointerout":case"pointerover":case"scroll":case"touchmove":case"wheel":case"mouseenter":case"mouseleave":case"pointerenter":case"pointerleave":return 8;case"message":switch(lh()){case w1:return 2;case E1:return 8;case _s:case ah:return 32;case T1:return 268435456;default:return 32}default:return 32}}var gr=!1,tl=null,el=null,nl=null,Zo=new Map,Go=new Map,Qn=[],yg="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");function f1(t,e){switch(t){case"focusin":case"focusout":tl=null;break;case"dragenter":case"dragleave":el=null;break;case"mouseover":case"mouseout":nl=null;break;case"pointerover":case"pointerout":Zo.delete(e.pointerId);break;case"gotpointercapture":case"lostpointercapture":Go.delete(e.pointerId)}}function _o(t,e,n,l,a,o){return t===null||t.nativeEvent!==o?(t={blockedOn:e,domEventName:n,eventSystemFlags:l,nativeEvent:o,targetContainers:[a]},e!==null&&(e=Da(e),e!==null&&Pm(e)),t):(t.eventSystemFlags|=l,e=t.targetContainers,a!==null&&e.indexOf(a)===-1&&e.push(a),t)}function gg(t,e,n,l,a){switch(e){case"focusin":return tl=_o(tl,t,e,n,l,a),!0;case"dragenter":return el=_o(el,t,e,n,l,a),!0;case"mouseover":return nl=_o(nl,t,e,n,l,a),!0;case"pointerover":var o=a.pointerId;return Zo.set(o,_o(Zo.get(o)||null,t,e,n,l,a)),!0;case"gotpointercapture":return o=a.pointerId,Go.set(o,_o(Go.get(o)||null,t,e,n,l,a)),!0}return!1}function e5(t){var e=oa(t.target);if(e!==null){var n=$o(e);if(n!==null){if(e=n.tag,e===13){if(e=b1(n),e!==null){t.blockedOn=e,J_(t.priority,function(){_1(n)});return}}else if(e===31){if(e=v1(n),e!==null){t.blockedOn=e,J_(t.priority,function(){_1(n)});return}}else if(e===3&&n.stateNode.current.memoizedState.isDehydrated){t.blockedOn=n.tag===3?n.stateNode.containerInfo:null;return}}}t.blockedOn=null}function us(t){if(t.blockedOn!==null)return!1;for(var e=t.targetContainers;0<e.length;){var n=yr(t.nativeEvent);if(n===null){n=t.nativeEvent;var l=new n.constructor(n.type,n);Bc=l,n.target.dispatchEvent(l),Bc=null}else return e=Da(n),e!==null&&Pm(e),t.blockedOn=n,!1;e.shift()}return!0}function m1(t,e,n){us(t)&&n.delete(e)}function pg(){gr=!1,tl!==null&&us(tl)&&(tl=null),el!==null&&us(el)&&(el=null),nl!==null&&us(nl)&&(nl=null),Zo.forEach(m1),Go.forEach(m1)}function $i(t,e){t.blockedOn===e&&(t.blockedOn=null,gr||(gr=!0,Qt.unstable_scheduleCallback(Qt.unstable_NormalPriority,pg)))}var Vi=null;function h1(t){Vi!==t&&(Vi=t,Qt.unstable_scheduleCallback(Qt.unstable_NormalPriority,function(){Vi===t&&(Vi=null);for(var e=0;e<t.length;e+=3){var n=t[e],l=t[e+1],a=t[e+2];if(typeof l!="function"){if(_d(l||n)===null)continue;break}var o=Da(n);o!==null&&(t.splice(e,3),e-=3,Ic(o,{pending:!0,data:a,method:n.method,action:l},l,a))}}))}function Na(t){function e(u){return $i(u,t)}tl!==null&&$i(tl,t),el!==null&&$i(el,t),nl!==null&&$i(nl,t),Zo.forEach(e),Go.forEach(e);for(var n=0;n<Qn.length;n++){var l=Qn[n];l.blockedOn===t&&(l.blockedOn=null)}for(;0<Qn.length&&(n=Qn[0],n.blockedOn===null);)e5(n),n.blockedOn===null&&Qn.shift();if(n=(t.ownerDocument||t).$$reactFormReplay,n!=null)for(l=0;l<n.length;l+=3){var a=n[l],o=n[l+1],i=a[_e]||null;if(typeof o=="function")i||h1(n);else if(i){var s=null;if(o&&o.hasAttribute("formAction")){if(a=o,i=o[_e]||null)s=i.formAction;else if(_d(a)!==null)continue}else s=i.action;typeof s=="function"?n[l+1]=s:(n.splice(l,3),l-=3),h1(n)}}}function n5(){function t(o){o.canIntercept&&o.info==="react-transition"&&o.intercept({handler:function(){return new Promise(function(i){return a=i})},focusReset:"manual",scroll:"manual"})}function e(){a!==null&&(a(),a=null),l||setTimeout(n,20)}function n(){if(!l&&!navigation.transition){var o=navigation.currentEntry;o&&o.url!=null&&navigation.navigate(o.url,{state:o.getState(),info:"react-transition",history:"replace"})}}if(typeof navigation=="object"){var l=!1,a=null;return navigation.addEventListener("navigate",t),navigation.addEventListener("navigatesuccess",e),navigation.addEventListener("navigateerror",e),setTimeout(n,100),function(){l=!0,navigation.removeEventListener("navigate",t),navigation.removeEventListener("navigatesuccess",e),navigation.removeEventListener("navigateerror",e),a!==null&&(a(),a=null)}}}function fd(t){this._internalRoot=t}Ps.prototype.render=fd.prototype.render=function(t){var e=this._internalRoot;if(e===null)throw Error(w(409));var n=e.current,l=Ee();Fm(n,l,t,e,null,null)};Ps.prototype.unmount=fd.prototype.unmount=function(){var t=this._internalRoot;if(t!==null){this._internalRoot=null;var e=t.containerInfo;Fm(t.current,2,null,t,null,null),Ws(),e[Oa]=null}};function Ps(t){this._internalRoot=t}Ps.prototype.unstable_scheduleHydration=function(t){if(t){var e=L1();t={blockedOn:null,target:t,priority:e};for(var n=0;n<Qn.length&&e!==0&&e<Qn[n].priority;n++);Qn.splice(n,0,t),n===0&&e5(t)}};var y1=g1.version;if(y1!=="19.2.0")throw Error(w(527,y1,"19.2.0"));rt.findDOMNode=function(t){var e=t._reactInternals;if(e===void 0)throw typeof t.render=="function"?Error(w(188)):(t=Object.keys(t).join(","),Error(w(268,t)));return t=W2(e),t=t!==null?x1(t):null,t=t===null?null:t.stateNode,t};var bg={bundleType:0,version:"19.2.0",rendererPackageName:"react-dom",currentDispatcherRef:Q,reconcilerVersion:"19.2.0"};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<"u"&&(fo=__REACT_DEVTOOLS_GLOBAL_HOOK__,!fo.isDisabled&&fo.supportsFiber))try{Vo=fo.inject(bg),Se=fo}catch{}var fo;tu.createRoot=function(t,e){if(!p1(t))throw Error(w(299));var n=!1,l="",a=V0,o=K0,i=J0;return e!=null&&(e.unstable_strictMode===!0&&(n=!0),e.identifierPrefix!==void 0&&(l=e.identifierPrefix),e.onUncaughtError!==void 0&&(a=e.onUncaughtError),e.onCaughtError!==void 0&&(o=e.onCaughtError),e.onRecoverableError!==void 0&&(i=e.onRecoverableError)),e=Wm(t,1,!1,null,null,n,l,null,a,o,i,n5),t[Oa]=e.current,sd(t),new fd(e)};tu.hydrateRoot=function(t,e,n){if(!p1(t))throw Error(w(299));var l=!1,a="",o=V0,i=K0,s=J0,u=null;return n!=null&&(n.unstable_strictMode===!0&&(l=!0),n.identifierPrefix!==void 0&&(a=n.identifierPrefix),n.onUncaughtError!==void 0&&(o=n.onUncaughtError),n.onCaughtError!==void 0&&(i=n.onCaughtError),n.onRecoverableError!==void 0&&(s=n.onRecoverableError),n.formState!==void 0&&(u=n.formState)),e=Wm(t,1,!0,e,n??null,l,a,u,o,i,s,n5),e.context=Im(null),n=e.current,l=Ee(),l=xr(l),a=Wn(l),a.callback=null,In(n,a,l),n=l,e.current.lanes=n,Jo(e,n),an(e),t[Oa]=e.current,sd(t),new Ps(e)};tu.version="19.2.0"});var i5=We((Rg,o5)=>{"use strict";function a5(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(a5)}catch(t){console.error(t)}}a5(),o5.exports=l5()});var E=Dn($l(),1),Nu=Dn(Cu(),1),At=Dn($l(),1),k=Dn(pi(),1),St=Dn(pi(),1),y=Dn(pi(),1),P5=`svg[fill=none] {
  fill: none !important;
}

@keyframes styles-module__popupEnter___AuQDN {
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.95) translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scale(1) translateY(0);
  }
}
@keyframes styles-module__popupExit___JJKQX {
  from {
    opacity: 1;
    transform: translateX(-50%) scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: translateX(-50%) scale(0.95) translateY(4px);
  }
}
@keyframes styles-module__shake___jdbWe {
  0%, 100% {
    transform: translateX(-50%) scale(1) translateY(0) translateX(0);
  }
  20% {
    transform: translateX(-50%) scale(1) translateY(0) translateX(-3px);
  }
  40% {
    transform: translateX(-50%) scale(1) translateY(0) translateX(3px);
  }
  60% {
    transform: translateX(-50%) scale(1) translateY(0) translateX(-2px);
  }
  80% {
    transform: translateX(-50%) scale(1) translateY(0) translateX(2px);
  }
}
.styles-module__popup___IhzrD {
  position: fixed;
  transform: translateX(-50%);
  width: 280px;
  padding: 0.75rem 1rem 14px;
  background: #1a1a1a;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.08);
  cursor: default;
  z-index: 100001;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  will-change: transform, opacity;
  opacity: 0;
}
.styles-module__popup___IhzrD.styles-module__enter___L7U7N {
  animation: styles-module__popupEnter___AuQDN 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.styles-module__popup___IhzrD.styles-module__entered___COX-w {
  opacity: 1;
  transform: translateX(-50%) scale(1) translateY(0);
}
.styles-module__popup___IhzrD.styles-module__exit___5eGjE {
  animation: styles-module__popupExit___JJKQX 0.15s ease-in forwards;
}
.styles-module__popup___IhzrD.styles-module__entered___COX-w.styles-module__shake___jdbWe {
  animation: styles-module__shake___jdbWe 0.25s ease-out;
}

.styles-module__header___wWsSi {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5625rem;
}

.styles-module__element___fTV2z {
  font-size: 0.75rem;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.5);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.styles-module__headerToggle___WpW0b {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  flex: 1;
  min-width: 0;
  text-align: left;
}
.styles-module__headerToggle___WpW0b .styles-module__element___fTV2z {
  flex: 1;
}

.styles-module__chevron___ZZJlR {
  color: rgba(255, 255, 255, 0.5);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}
.styles-module__chevron___ZZJlR.styles-module__expanded___2Hxgv {
  transform: rotate(90deg);
}

.styles-module__stylesWrapper___pnHgy {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.styles-module__stylesWrapper___pnHgy.styles-module__expanded___2Hxgv {
  grid-template-rows: 1fr;
}

.styles-module__stylesInner___YYZe2 {
  overflow: hidden;
}

.styles-module__stylesBlock___VfQKn {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 0.375rem;
  padding: 0.5rem 0.625rem;
  margin-bottom: 0.5rem;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.6875rem;
  line-height: 1.5;
}

.styles-module__styleLine___1YQiD {
  color: rgba(255, 255, 255, 0.85);
  word-break: break-word;
}

.styles-module__styleProperty___84L1i {
  color: #c792ea;
}

.styles-module__styleValue___q51-h {
  color: rgba(255, 255, 255, 0.85);
}

.styles-module__timestamp___Dtpsv {
  font-size: 0.625rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.35);
  font-variant-numeric: tabular-nums;
  margin-left: 0.5rem;
  flex-shrink: 0;
}

.styles-module__quote___mcMmQ {
  font-size: 12px;
  font-style: italic;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.5rem;
  padding: 0.4rem 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 0.25rem;
  line-height: 1.45;
}

.styles-module__textarea___jrSae {
  width: 100%;
  padding: 0.5rem 0.625rem;
  font-size: 0.8125rem;
  font-family: inherit;
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  resize: none;
  outline: none;
  transition: border-color 0.15s ease;
}
.styles-module__textarea___jrSae:focus {
  border-color: #3c82f7;
}
.styles-module__textarea___jrSae.styles-module__green___99l3h:focus {
  border-color: #34c759;
}
.styles-module__textarea___jrSae::placeholder {
  color: rgba(255, 255, 255, 0.35);
}
.styles-module__textarea___jrSae::-webkit-scrollbar {
  width: 6px;
}
.styles-module__textarea___jrSae::-webkit-scrollbar-track {
  background: transparent;
}
.styles-module__textarea___jrSae::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.styles-module__actions___D6x3f {
  display: flex;
  justify-content: flex-end;
  gap: 0.375rem;
  margin-top: 0.5rem;
}

.styles-module__cancel___hRjnL,
.styles-module__submit___K-mIR {
  padding: 0.4rem 0.875rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 1rem;
  border: none;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}

.styles-module__cancel___hRjnL {
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
}
.styles-module__cancel___hRjnL:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.styles-module__submit___K-mIR {
  color: white;
}
.styles-module__submit___K-mIR:hover:not(:disabled) {
  filter: brightness(0.9);
}
.styles-module__submit___K-mIR:disabled {
  cursor: not-allowed;
}

.styles-module__deleteWrapper___oSjdo {
  margin-right: auto;
}

.styles-module__deleteButton___4VuAE {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.4);
  transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
}
.styles-module__deleteButton___4VuAE:hover {
  background: rgba(255, 59, 48, 0.25);
  color: #ff3b30;
}
.styles-module__deleteButton___4VuAE:active {
  transform: scale(0.92);
}

.styles-module__light___6AaSQ.styles-module__popup___IhzrD {
  background: #fff;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06);
}
.styles-module__light___6AaSQ .styles-module__element___fTV2z {
  color: rgba(0, 0, 0, 0.6);
}
.styles-module__light___6AaSQ .styles-module__timestamp___Dtpsv {
  color: rgba(0, 0, 0, 0.4);
}
.styles-module__light___6AaSQ .styles-module__chevron___ZZJlR {
  color: rgba(0, 0, 0, 0.4);
}
.styles-module__light___6AaSQ .styles-module__stylesBlock___VfQKn {
  background: rgba(0, 0, 0, 0.03);
}
.styles-module__light___6AaSQ .styles-module__styleLine___1YQiD {
  color: rgba(0, 0, 0, 0.75);
}
.styles-module__light___6AaSQ .styles-module__styleProperty___84L1i {
  color: #7c3aed;
}
.styles-module__light___6AaSQ .styles-module__styleValue___q51-h {
  color: rgba(0, 0, 0, 0.75);
}
.styles-module__light___6AaSQ .styles-module__quote___mcMmQ {
  color: rgba(0, 0, 0, 0.55);
  background: rgba(0, 0, 0, 0.04);
}
.styles-module__light___6AaSQ .styles-module__textarea___jrSae {
  background: rgba(0, 0, 0, 0.03);
  color: #1a1a1a;
  border-color: rgba(0, 0, 0, 0.12);
}
.styles-module__light___6AaSQ .styles-module__textarea___jrSae::placeholder {
  color: rgba(0, 0, 0, 0.4);
}
.styles-module__light___6AaSQ .styles-module__textarea___jrSae::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
}
.styles-module__light___6AaSQ .styles-module__cancel___hRjnL {
  color: rgba(0, 0, 0, 0.5);
}
.styles-module__light___6AaSQ .styles-module__cancel___hRjnL:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.75);
}
.styles-module__light___6AaSQ .styles-module__deleteButton___4VuAE {
  color: rgba(0, 0, 0, 0.4);
}
.styles-module__light___6AaSQ .styles-module__deleteButton___4VuAE:hover {
  background: rgba(255, 59, 48, 0.15);
  color: #ff3b30;
}`,t2={popup:"styles-module__popup___IhzrD",enter:"styles-module__enter___L7U7N",popupEnter:"styles-module__popupEnter___AuQDN",entered:"styles-module__entered___COX-w",exit:"styles-module__exit___5eGjE",popupExit:"styles-module__popupExit___JJKQX",shake:"styles-module__shake___jdbWe",header:"styles-module__header___wWsSi",element:"styles-module__element___fTV2z",headerToggle:"styles-module__headerToggle___WpW0b",chevron:"styles-module__chevron___ZZJlR",expanded:"styles-module__expanded___2Hxgv",stylesWrapper:"styles-module__stylesWrapper___pnHgy",stylesInner:"styles-module__stylesInner___YYZe2",stylesBlock:"styles-module__stylesBlock___VfQKn",styleLine:"styles-module__styleLine___1YQiD",styleProperty:"styles-module__styleProperty___84L1i",styleValue:"styles-module__styleValue___q51-h",timestamp:"styles-module__timestamp___Dtpsv",quote:"styles-module__quote___mcMmQ",textarea:"styles-module__textarea___jrSae",green:"styles-module__green___99l3h",actions:"styles-module__actions___D6x3f",cancel:"styles-module__cancel___hRjnL",submit:"styles-module__submit___K-mIR",deleteWrapper:"styles-module__deleteWrapper___oSjdo",deleteButton:"styles-module__deleteButton___4VuAE",light:"styles-module__light___6AaSQ"};if(typeof document<"u"){let t=document.getElementById("feedback-tool-styles-annotation-popup-css-styles");t||(t=document.createElement("style"),t.id="feedback-tool-styles-annotation-popup-css-styles",t.textContent=P5,document.head.appendChild(t))}var yt=t2,e2=({size:t=16})=>(0,k.jsx)("svg",{width:t,height:t,viewBox:"0 0 16 16",fill:"none",children:(0,k.jsx)("path",{d:"M4 4l8 8M12 4l-8 8",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round"})}),n2=({size:t=16})=>(0,k.jsx)("svg",{width:t,height:t,viewBox:"0 0 16 16",fill:"none",children:(0,k.jsx)("path",{d:"M8 3v10M3 8h10",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round"})});var l2=({size:t=24,style:e={}})=>(0,k.jsxs)("svg",{width:t,height:t,viewBox:"0 0 24 24",fill:"none",style:e,children:[(0,k.jsxs)("g",{clipPath:"url(#clip0_list_sparkle)",children:[(0,k.jsx)("path",{d:"M11.5 12L5.5 12",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M18.5 6.75L5.5 6.75",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M9.25 17.25L5.5 17.25",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M16 12.75L16.5179 13.9677C16.8078 14.6494 17.3506 15.1922 18.0323 15.4821L19.25 16L18.0323 16.5179C17.3506 16.8078 16.8078 17.3506 16.5179 18.0323L16 19.25L15.4821 18.0323C15.1922 17.3506 14.6494 16.8078 13.9677 16.5179L12.75 16L13.9677 15.4821C14.6494 15.1922 15.1922 14.6494 15.4821 13.9677L16 12.75Z",stroke:"currentColor",strokeWidth:"1.5",strokeLinejoin:"round"})]}),(0,k.jsx)("defs",{children:(0,k.jsx)("clipPath",{id:"clip0_list_sparkle",children:(0,k.jsx)("rect",{width:"24",height:"24",fill:"white"})})})]}),Ia=({size:t=20})=>(0,k.jsxs)("svg",{width:t,height:t,viewBox:"0 0 20 20",fill:"none",children:[(0,k.jsx)("circle",{cx:"10",cy:"10.5",r:"5.25",stroke:"currentColor",strokeWidth:"1.25"}),(0,k.jsx)("path",{d:"M8.5 8.75C8.5 7.92 9.17 7.25 10 7.25C10.83 7.25 11.5 7.92 11.5 8.75C11.5 9.58 10.83 10.25 10 10.25V11",stroke:"currentColor",strokeWidth:"1.25",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("circle",{cx:"10",cy:"13",r:"0.75",fill:"currentColor"})]}),g_=({size:t=14})=>(0,k.jsxs)("svg",{width:t,height:t,viewBox:"0 0 14 14",fill:"none",children:[(0,k.jsx)("style",{children:`
      @keyframes checkDraw {
        0% {
          stroke-dashoffset: 12;
        }
        100% {
          stroke-dashoffset: 0;
        }
      }
      @keyframes checkBounce {
        0% {
          transform: scale(0.5);
          opacity: 0;
        }
        50% {
          transform: scale(1.12);
          opacity: 1;
        }
        75% {
          transform: scale(0.95);
        }
        100% {
          transform: scale(1);
        }
      }
      .check-path-animated {
        stroke-dasharray: 12;
        stroke-dashoffset: 0;
        transform-origin: center;
        animation: checkDraw 0.18s ease-out, checkBounce 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
    `}),(0,k.jsx)("path",{className:"check-path-animated",d:"M3.9375 7L6.125 9.1875L10.5 4.8125",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"})]});var a2=({size:t=24,copied:e=!1})=>(0,k.jsxs)("svg",{width:t,height:t,viewBox:"0 0 24 24",fill:"none",children:[(0,k.jsx)("style",{children:`
      .copy-icon, .check-icon {
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
    `}),(0,k.jsxs)("g",{className:"copy-icon",style:{opacity:e?0:1,transform:e?"scale(0.8)":"scale(1)",transformOrigin:"center"},children:[(0,k.jsx)("path",{d:"M4.75 11.25C4.75 10.4216 5.42157 9.75 6.25 9.75H12.75C13.5784 9.75 14.25 10.4216 14.25 11.25V17.75C14.25 18.5784 13.5784 19.25 12.75 19.25H6.25C5.42157 19.25 4.75 18.5784 4.75 17.75V11.25Z",stroke:"currentColor",strokeWidth:"1.5"}),(0,k.jsx)("path",{d:"M17.25 14.25H17.75C18.5784 14.25 19.25 13.5784 19.25 12.75V6.25C19.25 5.42157 18.5784 4.75 17.75 4.75H11.25C10.4216 4.75 9.75 5.42157 9.75 6.25V6.75",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round"})]}),(0,k.jsxs)("g",{className:"check-icon",style:{opacity:e?1:0,transform:e?"scale(1)":"scale(0.8)",transformOrigin:"center"},children:[(0,k.jsx)("path",{d:"M12 20C7.58172 20 4 16.4182 4 12C4 7.58172 7.58172 4 12 4C16.4182 4 20 7.58172 20 12C20 16.4182 16.4182 20 12 20Z",stroke:"#22c55e",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M15 10L11 14.25L9.25 12.25",stroke:"#22c55e",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"})]})]}),o2=({size:t=24,state:e="idle"})=>{let n=e==="idle",l=e==="sent",a=e==="failed";return(0,k.jsxs)("svg",{width:t,height:t,viewBox:"0 0 24 24",fill:"none",children:[(0,k.jsx)("style",{children:`
        .send-arrow-icon, .send-check-icon, .send-error-icon {
          transition: opacity 0.15s ease, transform 0.15s ease;
        }
      `}),(0,k.jsx)("g",{className:"send-arrow-icon",style:{opacity:n?1:e==="sending"?.5:0,transform:n?"scale(1)":"scale(0.8)",transformOrigin:"center"},children:(0,k.jsx)("path",{d:"M9.875 14.125L12.3506 19.6951C12.7184 20.5227 13.9091 20.4741 14.2083 19.6193L18.8139 6.46032C19.0907 5.6695 18.3305 4.90933 17.5397 5.18611L4.38072 9.79174C3.52589 10.0909 3.47731 11.2816 4.30494 11.6494L9.875 14.125ZM9.875 14.125L13.375 10.625",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"})}),(0,k.jsxs)("g",{className:"send-check-icon",style:{opacity:l?1:0,transform:l?"scale(1)":"scale(0.8)",transformOrigin:"center"},children:[(0,k.jsx)("path",{d:"M12 20C7.58172 20 4 16.4182 4 12C4 7.58172 7.58172 4 12 4C16.4182 4 20 7.58172 20 12C20 16.4182 16.4182 20 12 20Z",stroke:"#22c55e",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M15 10L11 14.25L9.25 12.25",stroke:"#22c55e",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"})]}),(0,k.jsxs)("g",{className:"send-error-icon",style:{opacity:a?1:0,transform:a?"scale(1)":"scale(0.8)",transformOrigin:"center"},children:[(0,k.jsx)("path",{d:"M12 20C7.58172 20 4 16.4182 4 12C4 7.58172 7.58172 4 12 4C16.4182 4 20 7.58172 20 12C20 16.4182 16.4182 20 12 20Z",stroke:"#ef4444",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M12 8V12",stroke:"#ef4444",strokeWidth:"1.5",strokeLinecap:"round"}),(0,k.jsx)("circle",{cx:"12",cy:"15",r:"0.5",fill:"#ef4444",stroke:"#ef4444",strokeWidth:"1"})]})]})};var i2=({size:t=24,isOpen:e=!0})=>(0,k.jsxs)("svg",{width:t,height:t,viewBox:"0 0 24 24",fill:"none",children:[(0,k.jsx)("style",{children:`
      .eye-open, .eye-closed {
        transition: opacity 0.2s ease;
      }
    `}),(0,k.jsxs)("g",{className:"eye-open",style:{opacity:e?1:0},children:[(0,k.jsx)("path",{d:"M3.91752 12.7539C3.65127 12.2996 3.65037 11.7515 3.9149 11.2962C4.9042 9.59346 7.72688 5.49994 12 5.49994C16.2731 5.49994 19.0958 9.59346 20.0851 11.2962C20.3496 11.7515 20.3487 12.2996 20.0825 12.7539C19.0908 14.4459 16.2694 18.4999 12 18.4999C7.73064 18.4999 4.90918 14.4459 3.91752 12.7539Z",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M12 14.8261C13.5608 14.8261 14.8261 13.5608 14.8261 12C14.8261 10.4392 13.5608 9.17392 12 9.17392C10.4392 9.17392 9.17391 10.4392 9.17391 12C9.17391 13.5608 10.4392 14.8261 12 14.8261Z",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"})]}),(0,k.jsxs)("g",{className:"eye-closed",style:{opacity:e?0:1},children:[(0,k.jsx)("path",{d:"M18.6025 9.28503C18.9174 8.9701 19.4364 8.99481 19.7015 9.35271C20.1484 9.95606 20.4943 10.507 20.7342 10.9199C21.134 11.6086 21.1329 12.4454 20.7303 13.1328C20.2144 14.013 19.2151 15.5225 17.7723 16.8193C16.3293 18.1162 14.3852 19.2497 12.0008 19.25C11.4192 19.25 10.8638 19.1823 10.3355 19.0613C9.77966 18.934 9.63498 18.2525 10.0382 17.8493C10.2412 17.6463 10.5374 17.573 10.8188 17.6302C11.1993 17.7076 11.5935 17.75 12.0008 17.75C13.8848 17.7497 15.4867 16.8568 16.7693 15.7041C18.0522 14.5511 18.9606 13.1867 19.4363 12.375C19.5656 12.1543 19.5659 11.8943 19.4373 11.6729C19.2235 11.3049 18.921 10.8242 18.5364 10.3003C18.3085 9.98991 18.3302 9.5573 18.6025 9.28503ZM12.0008 4.75C12.5814 4.75006 13.1358 4.81803 13.6632 4.93953C14.2182 5.06741 14.362 5.74812 13.9593 6.15091C13.7558 6.35435 13.4589 6.42748 13.1771 6.36984C12.7983 6.29239 12.4061 6.25006 12.0008 6.25C10.1167 6.25 8.51415 7.15145 7.23028 8.31543C5.94678 9.47919 5.03918 10.8555 4.56426 11.6729C4.43551 11.8945 4.43582 12.1542 4.56524 12.375C4.77587 12.7343 5.07189 13.2012 5.44718 13.7105C5.67623 14.0213 5.65493 14.4552 5.38193 14.7282C5.0671 15.0431 4.54833 15.0189 4.28292 14.6614C3.84652 14.0736 3.50813 13.5369 3.27129 13.1328C2.86831 12.4451 2.86717 11.6088 3.26739 10.9199C3.78185 10.0345 4.77959 8.51239 6.22247 7.2041C7.66547 5.89584 9.61202 4.75 12.0008 4.75Z",fill:"currentColor"}),(0,k.jsx)("path",{d:"M5 19L19 5",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round"})]})]}),s2=({size:t=24,isPaused:e=!1})=>(0,k.jsxs)("svg",{width:t,height:t,viewBox:"0 0 24 24",fill:"none",children:[(0,k.jsx)("style",{children:`
      .pause-bar, .play-triangle {
        transition: opacity 0.15s ease;
      }
    `}),(0,k.jsx)("path",{className:"pause-bar",d:"M8 6L8 18",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",style:{opacity:e?0:1}}),(0,k.jsx)("path",{className:"pause-bar",d:"M16 18L16 6",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",style:{opacity:e?0:1}}),(0,k.jsx)("path",{className:"play-triangle",d:"M17.75 10.701C18.75 11.2783 18.75 12.7217 17.75 13.299L8.75 18.4952C7.75 19.0725 6.5 18.3509 6.5 17.1962L6.5 6.80384C6.5 5.64914 7.75 4.92746 8.75 5.50481L17.75 10.701Z",stroke:"currentColor",strokeWidth:"1.5",style:{opacity:e?1:0}})]});var u2=({size:t=16})=>(0,k.jsxs)("svg",{width:t,height:t,viewBox:"0 0 24 24",fill:"none",children:[(0,k.jsx)("path",{d:"M10.6504 5.81117C10.9939 4.39628 13.0061 4.39628 13.3496 5.81117C13.5715 6.72517 14.6187 7.15891 15.4219 6.66952C16.6652 5.91193 18.0881 7.33479 17.3305 8.57815C16.8411 9.38134 17.2748 10.4285 18.1888 10.6504C19.6037 10.9939 19.6037 13.0061 18.1888 13.3496C17.2748 13.5715 16.8411 14.6187 17.3305 15.4219C18.0881 16.6652 16.6652 18.0881 15.4219 17.3305C14.6187 16.8411 13.5715 17.2748 13.3496 18.1888C13.0061 19.6037 10.9939 19.6037 10.6504 18.1888C10.4285 17.2748 9.38135 16.8411 8.57815 17.3305C7.33479 18.0881 5.91193 16.6652 6.66952 15.4219C7.15891 14.6187 6.72517 13.5715 5.81117 13.3496C4.39628 13.0061 4.39628 10.9939 5.81117 10.6504C6.72517 10.4285 7.15891 9.38134 6.66952 8.57815C5.91193 7.33479 7.33479 5.91192 8.57815 6.66952C9.38135 7.15891 10.4285 6.72517 10.6504 5.81117Z",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("circle",{cx:"12",cy:"12",r:"2.5",stroke:"currentColor",strokeWidth:"1.5"})]});var c2=({size:t=16})=>(0,k.jsx)("svg",{width:t,height:t,viewBox:"0 0 24 24",fill:"none",children:(0,k.jsx)("path",{d:"M13.5 4C14.7426 4 15.75 5.00736 15.75 6.25V7H18.5C18.9142 7 19.25 7.33579 19.25 7.75C19.25 8.16421 18.9142 8.5 18.5 8.5H17.9678L17.6328 16.2217C17.61 16.7475 17.5912 17.1861 17.5469 17.543C17.5015 17.9087 17.4225 18.2506 17.2461 18.5723C16.9747 19.0671 16.5579 19.4671 16.0518 19.7168C15.7227 19.8791 15.3772 19.9422 15.0098 19.9717C14.6514 20.0004 14.2126 20 13.6865 20H10.3135C9.78735 20 9.34856 20.0004 8.99023 19.9717C8.62278 19.9422 8.27729 19.8791 7.94824 19.7168C7.44205 19.4671 7.02532 19.0671 6.75391 18.5723C6.57751 18.2506 6.49853 17.9087 6.45312 17.543C6.40883 17.1861 6.39005 16.7475 6.36719 16.2217L6.03223 8.5H5.5C5.08579 8.5 4.75 8.16421 4.75 7.75C4.75 7.33579 5.08579 7 5.5 7H8.25V6.25C8.25 5.00736 9.25736 4 10.5 4H13.5ZM7.86621 16.1562C7.89013 16.7063 7.90624 17.0751 7.94141 17.3584C7.97545 17.6326 8.02151 17.7644 8.06934 17.8516C8.19271 18.0763 8.38239 18.2577 8.6123 18.3711C8.70153 18.4151 8.83504 18.4545 9.11035 18.4766C9.39482 18.4994 9.76335 18.5 10.3135 18.5H13.6865C14.2367 18.5 14.6052 18.4994 14.8896 18.4766C15.165 18.4545 15.2985 18.4151 15.3877 18.3711C15.6176 18.2577 15.8073 18.0763 15.9307 17.8516C15.9785 17.7644 16.0245 17.6326 16.0586 17.3584C16.0938 17.0751 16.1099 16.7063 16.1338 16.1562L16.4668 8.5H7.5332L7.86621 16.1562ZM9.97656 10.75C10.3906 10.7371 10.7371 11.0626 10.75 11.4766L10.875 15.4766C10.8879 15.8906 10.5624 16.2371 10.1484 16.25C9.73443 16.2629 9.38794 15.9374 9.375 15.5234L9.25 11.5234C9.23706 11.1094 9.56255 10.7629 9.97656 10.75ZM14.0244 10.75C14.4384 10.7635 14.7635 11.1105 14.75 11.5244L14.6201 15.5244C14.6066 15.9384 14.2596 16.2634 13.8457 16.25C13.4317 16.2365 13.1067 15.8896 13.1201 15.4756L13.251 11.4756C13.2645 11.0617 13.6105 10.7366 14.0244 10.75ZM10.5 5.5C10.0858 5.5 9.75 5.83579 9.75 6.25V7H14.25V6.25C14.25 5.83579 13.9142 5.5 13.5 5.5H10.5Z",fill:"currentColor"})});var Su=({size:t=16})=>(0,k.jsxs)("svg",{width:t,height:t,viewBox:"0 0 24 24",fill:"none",children:[(0,k.jsxs)("g",{clipPath:"url(#clip0_2_53)",children:[(0,k.jsx)("path",{d:"M16.25 16.25L7.75 7.75",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M7.75 16.25L16.25 7.75",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"})]}),(0,k.jsx)("defs",{children:(0,k.jsx)("clipPath",{id:"clip0_2_53",children:(0,k.jsx)("rect",{width:"24",height:"24",fill:"white"})})})]}),r2=({size:t=24})=>(0,k.jsx)("svg",{width:t,height:t,viewBox:"0 0 24 24",fill:"none",children:(0,k.jsx)("path",{d:"M16.7198 6.21973C17.0127 5.92683 17.4874 5.92683 17.7803 6.21973C18.0732 6.51262 18.0732 6.9874 17.7803 7.28027L13.0606 12L17.7803 16.7197C18.0732 17.0126 18.0732 17.4874 17.7803 17.7803C17.4875 18.0731 17.0127 18.0731 16.7198 17.7803L12.0001 13.0605L7.28033 17.7803C6.98746 18.0731 6.51268 18.0731 6.21979 17.7803C5.92689 17.4874 5.92689 17.0126 6.21979 16.7197L10.9395 12L6.21979 7.28027C5.92689 6.98738 5.92689 6.51262 6.21979 6.21973C6.51268 5.92683 6.98744 5.92683 7.28033 6.21973L12.0001 10.9395L16.7198 6.21973Z",fill:"currentColor"})}),d2=({size:t=16})=>(0,k.jsxs)("svg",{width:t,height:t,viewBox:"0 0 20 20",fill:"none",children:[(0,k.jsx)("path",{d:"M9.99999 12.7082C11.4958 12.7082 12.7083 11.4956 12.7083 9.99984C12.7083 8.50407 11.4958 7.2915 9.99999 7.2915C8.50422 7.2915 7.29166 8.50407 7.29166 9.99984C7.29166 11.4956 8.50422 12.7082 9.99999 12.7082Z",stroke:"currentColor",strokeWidth:"1.25",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M10 3.9585V5.05698",stroke:"currentColor",strokeWidth:"1.25",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M10 14.9429V16.0414",stroke:"currentColor",strokeWidth:"1.25",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M5.7269 5.72656L6.50682 6.50649",stroke:"currentColor",strokeWidth:"1.25",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M13.4932 13.4932L14.2731 14.2731",stroke:"currentColor",strokeWidth:"1.25",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M3.95834 10H5.05683",stroke:"currentColor",strokeWidth:"1.25",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M14.9432 10H16.0417",stroke:"currentColor",strokeWidth:"1.25",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M5.7269 14.2731L6.50682 13.4932",stroke:"currentColor",strokeWidth:"1.25",strokeLinecap:"round",strokeLinejoin:"round"}),(0,k.jsx)("path",{d:"M13.4932 6.50649L14.2731 5.72656",stroke:"currentColor",strokeWidth:"1.25",strokeLinecap:"round",strokeLinejoin:"round"})]}),_2=({size:t=16})=>(0,k.jsx)("svg",{width:t,height:t,viewBox:"0 0 20 20",fill:"none",children:(0,k.jsx)("path",{d:"M15.5 10.4955C15.4037 11.5379 15.0124 12.5314 14.3721 13.3596C13.7317 14.1878 12.8688 14.8165 11.8841 15.1722C10.8995 15.5278 9.83397 15.5957 8.81217 15.3679C7.79038 15.1401 6.8546 14.6259 6.11434 13.8857C5.37408 13.1454 4.85995 12.2096 4.63211 11.1878C4.40427 10.166 4.47215 9.10048 4.82781 8.11585C5.18346 7.13123 5.81218 6.26825 6.64039 5.62791C7.4686 4.98756 8.46206 4.59634 9.5045 4.5C8.89418 5.32569 8.60049 6.34302 8.67685 7.36695C8.75321 8.39087 9.19454 9.35339 9.92058 10.0794C10.6466 10.8055 11.6091 11.2468 12.6331 11.3231C13.657 11.3995 14.6743 11.1058 15.5 10.4955Z",stroke:"currentColor",strokeWidth:"1.13793",strokeLinecap:"round",strokeLinejoin:"round"})}),p_=({size:t=16})=>(0,k.jsx)("svg",{width:t,height:t,viewBox:"0 0 16 16",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:(0,k.jsx)("path",{d:"M11.3799 6.9572L9.05645 4.63375M11.3799 6.9572L6.74949 11.5699C6.61925 11.6996 6.45577 11.791 6.277 11.8339L4.29549 12.3092C3.93194 12.3964 3.60478 12.0683 3.69297 11.705L4.16585 9.75693C4.20893 9.57947 4.29978 9.4172 4.42854 9.28771L9.05645 4.63375M11.3799 6.9572L12.3455 5.98759C12.9839 5.34655 12.9839 4.31002 12.3455 3.66897C11.7033 3.02415 10.6594 3.02415 10.0172 3.66897L9.06126 4.62892L9.05645 4.63375",stroke:"currentColor",strokeWidth:"0.9",strokeLinecap:"round",strokeLinejoin:"round"})}),f2=({size:t=24})=>(0,k.jsx)("svg",{width:t,height:t,viewBox:"0 0 24 24",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:(0,k.jsx)("path",{d:"M13.5 4C14.7426 4 15.75 5.00736 15.75 6.25V7H18.5C18.9142 7 19.25 7.33579 19.25 7.75C19.25 8.16421 18.9142 8.5 18.5 8.5H17.9678L17.6328 16.2217C17.61 16.7475 17.5912 17.1861 17.5469 17.543C17.5015 17.9087 17.4225 18.2506 17.2461 18.5723C16.9747 19.0671 16.5579 19.4671 16.0518 19.7168C15.7227 19.8791 15.3772 19.9422 15.0098 19.9717C14.6514 20.0004 14.2126 20 13.6865 20H10.3135C9.78735 20 9.34856 20.0004 8.99023 19.9717C8.62278 19.9422 8.27729 19.8791 7.94824 19.7168C7.44205 19.4671 7.02532 19.0671 6.75391 18.5723C6.57751 18.2506 6.49853 17.9087 6.45312 17.543C6.40883 17.1861 6.39005 16.7475 6.36719 16.2217L6.03223 8.5H5.5C5.08579 8.5 4.75 8.16421 4.75 7.75C4.75 7.33579 5.08579 7 5.5 7H8.25V6.25C8.25 5.00736 9.25736 4 10.5 4H13.5ZM7.86621 16.1562C7.89013 16.7063 7.90624 17.0751 7.94141 17.3584C7.97545 17.6326 8.02151 17.7644 8.06934 17.8516C8.19271 18.0763 8.38239 18.2577 8.6123 18.3711C8.70153 18.4151 8.83504 18.4545 9.11035 18.4766C9.39482 18.4994 9.76335 18.5 10.3135 18.5H13.6865C14.2367 18.5 14.6052 18.4994 14.8896 18.4766C15.165 18.4545 15.2985 18.4151 15.3877 18.3711C15.6176 18.2577 15.8073 18.0763 15.9307 17.8516C15.9785 17.7644 16.0245 17.6326 16.0586 17.3584C16.0938 17.0751 16.1099 16.7063 16.1338 16.1562L16.4668 8.5H7.5332L7.86621 16.1562ZM9.97656 10.75C10.3906 10.7371 10.7371 11.0626 10.75 11.4766L10.875 15.4766C10.8879 15.8906 10.5624 16.2371 10.1484 16.25C9.73443 16.2629 9.38794 15.9374 9.375 15.5234L9.25 11.5234C9.23706 11.1094 9.56255 10.7629 9.97656 10.75ZM14.0244 10.75C14.4383 10.7635 14.7635 11.1105 14.75 11.5244L14.6201 15.5244C14.6066 15.9384 14.2596 16.2634 13.8457 16.25C13.4317 16.2365 13.1067 15.8896 13.1201 15.4756L13.251 11.4756C13.2645 11.0617 13.6105 10.7366 14.0244 10.75ZM10.5 5.5C10.0858 5.5 9.75 5.83579 9.75 6.25V7H14.25V6.25C14.25 5.83579 13.9142 5.5 13.5 5.5H10.5Z",fill:"currentColor"})}),m2=({size:t=16})=>(0,k.jsx)("svg",{width:t,height:t,viewBox:"0 0 16 16",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:(0,k.jsx)("path",{d:"M8.5 3.5L4 8L8.5 12.5",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"})});var k_=["data-feedback-toolbar","data-annotation-popup","data-annotation-marker"],wu=k_.flatMap(t=>[`:not([${t}])`,`:not([${t}] *)`]).join(""),Ou="feedback-freeze-styles",Eu="__agentation_freeze";function h2(){if(typeof window>"u")return{frozen:!1,installed:!0,origSetTimeout:setTimeout,origSetInterval:setInterval,origRAF:e=>0,pausedAnimations:[],frozenTimeoutQueue:[],frozenRAFQueue:[]};let t=window;return t[Eu]||(t[Eu]={frozen:!1,installed:!1,origSetTimeout:null,origSetInterval:null,origRAF:null,pausedAnimations:[],frozenTimeoutQueue:[],frozenRAFQueue:[]}),t[Eu]}var tt=h2();typeof window<"u"&&!tt.installed&&(tt.origSetTimeout=window.setTimeout.bind(window),tt.origSetInterval=window.setInterval.bind(window),tt.origRAF=window.requestAnimationFrame.bind(window),window.setTimeout=(t,e,...n)=>typeof t=="string"?tt.origSetTimeout(t,e):tt.origSetTimeout((...l)=>{tt.frozen?tt.frozenTimeoutQueue.push(()=>t(...l)):t(...l)},e,...n),window.setInterval=(t,e,...n)=>typeof t=="string"?tt.origSetInterval(t,e):tt.origSetInterval((...l)=>{tt.frozen||t(...l)},e,...n),window.requestAnimationFrame=t=>tt.origRAF(e=>{tt.frozen?tt.frozenRAFQueue.push(t):t(e)}),tt.installed=!0);var st=tt.origSetTimeout,y2=tt.origSetInterval;function g2(t){return t?k_.some(e=>!!t.closest?.(`[${e}]`)):!1}function p2(){if(typeof document>"u"||tt.frozen)return;tt.frozen=!0,tt.frozenTimeoutQueue=[],tt.frozenRAFQueue=[];let t=document.getElementById(Ou);t||(t=document.createElement("style"),t.id=Ou),t.textContent=`
    *${wu},
    *${wu}::before,
    *${wu}::after {
      animation-play-state: paused !important;
      transition: none !important;
    }
  `,document.head.appendChild(t),tt.pausedAnimations=[];try{document.getAnimations().forEach(e=>{if(e.playState!=="running")return;let n=e.effect?.target;g2(n)||(e.pause(),tt.pausedAnimations.push(e))})}catch{}document.querySelectorAll("video").forEach(e=>{e.paused||(e.dataset.wasPaused="false",e.pause())})}function b_(){if(typeof document>"u"||!tt.frozen)return;tt.frozen=!1;let t=tt.frozenTimeoutQueue;tt.frozenTimeoutQueue=[];for(let n of t)tt.origSetTimeout(()=>{if(tt.frozen){tt.frozenTimeoutQueue.push(n);return}try{n()}catch(l){console.warn("[agentation] Error replaying queued timeout:",l)}},0);let e=tt.frozenRAFQueue;tt.frozenRAFQueue=[];for(let n of e)tt.origRAF(l=>{if(tt.frozen){tt.frozenRAFQueue.push(n);return}n(l)});for(let n of tt.pausedAnimations)try{n.play()}catch(l){console.warn("[agentation] Error resuming animation:",l)}tt.pausedAnimations=[],document.getElementById(Ou)?.remove(),document.querySelectorAll("video").forEach(n=>{n.dataset.wasPaused==="false"&&(n.play().catch(()=>{}),delete n.dataset.wasPaused)})}var v_=(0,At.forwardRef)(function({element:e,timestamp:n,selectedText:l,placeholder:a="What should change?",initialValue:o="",submitLabel:i="Add",onSubmit:s,onCancel:u,onDelete:m,style:h,accentColor:v="#3c82f7",isExiting:g=!1,lightMode:b=!1,computedStyles:T},O){let[L,f]=(0,At.useState)(o),[_,p]=(0,At.useState)(!1),[C,B]=(0,At.useState)("initial"),[X,N]=(0,At.useState)(!1),[H,G]=(0,At.useState)(!1),I=(0,At.useRef)(null),ke=(0,At.useRef)(null),D=(0,At.useRef)(null),le=(0,At.useRef)(null);(0,At.useEffect)(()=>{g&&C!=="exit"&&B("exit")},[g,C]),(0,At.useEffect)(()=>{st(()=>{B("enter")},0);let jt=st(()=>{B("entered")},200),Hl=st(()=>{let $e=I.current;$e&&($e.focus(),$e.selectionStart=$e.selectionEnd=$e.value.length,$e.scrollTop=$e.scrollHeight)},50);return()=>{clearTimeout(jt),clearTimeout(Hl),D.current&&clearTimeout(D.current),le.current&&clearTimeout(le.current)}},[]);let Bl=(0,At.useCallback)(()=>{le.current&&clearTimeout(le.current),p(!0),le.current=st(()=>{p(!1),I.current?.focus()},250)},[]);(0,At.useImperativeHandle)(O,()=>({shake:Bl}),[Bl]);let Yl=(0,At.useCallback)(()=>{B("exit"),D.current=st(()=>{u()},150)},[u]),he=(0,At.useCallback)(()=>{L.trim()&&s(L.trim())},[L,s]),ja=(0,At.useCallback)(jt=>{jt.nativeEvent.isComposing||(jt.key==="Enter"&&!jt.shiftKey&&(jt.preventDefault(),he()),jt.key==="Escape"&&Yl())},[he,Yl]),yd=[yt.popup,b?yt.light:"",C==="enter"?yt.enter:"",C==="entered"?yt.entered:"",C==="exit"?yt.exit:"",_?yt.shake:""].filter(Boolean).join(" ");return(0,St.jsxs)("div",{ref:ke,className:yd,"data-annotation-popup":!0,style:h,onClick:jt=>jt.stopPropagation(),children:[(0,St.jsxs)("div",{className:yt.header,children:[T&&Object.keys(T).length>0?(0,St.jsxs)("button",{className:yt.headerToggle,onClick:()=>{let jt=H;G(!H),jt&&st(()=>I.current?.focus(),0)},type:"button",children:[(0,St.jsx)("svg",{className:`${yt.chevron} ${H?yt.expanded:""}`,width:"14",height:"14",viewBox:"0 0 14 14",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:(0,St.jsx)("path",{d:"M5.5 10.25L9 7.25L5.75 4",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"})}),(0,St.jsx)("span",{className:yt.element,children:e})]}):(0,St.jsx)("span",{className:yt.element,children:e}),n&&(0,St.jsx)("span",{className:yt.timestamp,children:n})]}),T&&Object.keys(T).length>0&&(0,St.jsx)("div",{className:`${yt.stylesWrapper} ${H?yt.expanded:""}`,children:(0,St.jsx)("div",{className:yt.stylesInner,children:(0,St.jsx)("div",{className:yt.stylesBlock,children:Object.entries(T).map(([jt,Hl])=>(0,St.jsxs)("div",{className:yt.styleLine,children:[(0,St.jsx)("span",{className:yt.styleProperty,children:jt.replace(/([A-Z])/g,"-$1").toLowerCase()}),": ",(0,St.jsx)("span",{className:yt.styleValue,children:Hl}),";"]},jt))})})}),l&&(0,St.jsxs)("div",{className:yt.quote,children:["\u201C",l.slice(0,80),l.length>80?"...":"","\u201D"]}),(0,St.jsx)("textarea",{ref:I,className:yt.textarea,style:{borderColor:X?v:void 0},placeholder:a,value:L,onChange:jt=>f(jt.target.value),onFocus:()=>N(!0),onBlur:()=>N(!1),rows:2,onKeyDown:ja}),(0,St.jsxs)("div",{className:yt.actions,children:[m&&(0,St.jsx)("div",{className:yt.deleteWrapper,children:(0,St.jsx)("button",{className:yt.deleteButton,onClick:m,type:"button",children:(0,St.jsx)(f2,{size:22})})}),(0,St.jsx)("button",{className:yt.cancel,onClick:Yl,children:"Cancel"}),(0,St.jsx)("button",{className:yt.submit,style:{backgroundColor:v,opacity:L.trim()?1:.4},onClick:he,disabled:!L.trim(),children:i})]})]})});function Jl(t){if(t.parentElement)return t.parentElement;let e=t.getRootNode();return e instanceof ShadowRoot?e.host:null}function ie(t,e){let n=t;for(;n;){if(n.matches(e))return n;n=Jl(n)}return null}function b2(t,e=4){let n=[],l=t,a=0;for(;l&&a<e;){let o=l.tagName.toLowerCase();if(o==="html"||o==="body")break;let i=o;if(l.id)i=`#${l.id}`;else if(l.className&&typeof l.className=="string"){let u=l.className.split(/\s+/).find(m=>m.length>2&&!m.match(/^[a-z]{1,2}$/)&&!m.match(/[A-Z0-9]{5,}/));u&&(i=`.${u.split("_")[0]}`)}let s=Jl(l);!l.parentElement&&s&&(i=`\u27E8shadow\u27E9 ${i}`),n.unshift(i),l=s,a++}return n.join(" > ")}function Ei(t){let e=b2(t);if(t.dataset.element)return{name:t.dataset.element,path:e};let n=t.tagName.toLowerCase();if(["path","circle","rect","line","g"].includes(n)){let l=ie(t,"svg");if(l){let a=Jl(l);if(a instanceof HTMLElement)return{name:`graphic in ${Ei(a).name}`,path:e}}return{name:"graphic element",path:e}}if(n==="svg"){let l=Jl(t);if(l?.tagName.toLowerCase()==="button"){let a=l.textContent?.trim();return{name:a?`icon in "${a}" button`:"button icon",path:e}}return{name:"icon",path:e}}if(n==="button"){let l=t.textContent?.trim(),a=t.getAttribute("aria-label");return a?{name:`button [${a}]`,path:e}:{name:l?`button "${l.slice(0,25)}"`:"button",path:e}}if(n==="a"){let l=t.textContent?.trim(),a=t.getAttribute("href");return l?{name:`link "${l.slice(0,25)}"`,path:e}:a?{name:`link to ${a.slice(0,30)}`,path:e}:{name:"link",path:e}}if(n==="input"){let l=t.getAttribute("type")||"text",a=t.getAttribute("placeholder"),o=t.getAttribute("name");return a?{name:`input "${a}"`,path:e}:o?{name:`input [${o}]`,path:e}:{name:`${l} input`,path:e}}if(["h1","h2","h3","h4","h5","h6"].includes(n)){let l=t.textContent?.trim();return{name:l?`${n} "${l.slice(0,35)}"`:n,path:e}}if(n==="p"){let l=t.textContent?.trim();return l?{name:`paragraph: "${l.slice(0,40)}${l.length>40?"...":""}"`,path:e}:{name:"paragraph",path:e}}if(n==="span"||n==="label"){let l=t.textContent?.trim();return l&&l.length<40?{name:`"${l}"`,path:e}:{name:n,path:e}}if(n==="li"){let l=t.textContent?.trim();return l&&l.length<40?{name:`list item: "${l.slice(0,35)}"`,path:e}:{name:"list item",path:e}}if(n==="blockquote")return{name:"blockquote",path:e};if(n==="code"){let l=t.textContent?.trim();return l&&l.length<30?{name:`code: \`${l}\``,path:e}:{name:"code",path:e}}if(n==="pre")return{name:"code block",path:e};if(n==="img"){let l=t.getAttribute("alt");return{name:l?`image "${l.slice(0,30)}"`:"image",path:e}}if(n==="video")return{name:"video",path:e};if(["div","section","article","nav","header","footer","aside","main"].includes(n)){let l=t.className,a=t.getAttribute("role"),o=t.getAttribute("aria-label");if(o)return{name:`${n} [${o}]`,path:e};if(a)return{name:`${a}`,path:e};if(typeof l=="string"&&l){let i=l.split(/[\s_-]+/).map(s=>s.replace(/[A-Z0-9]{5,}.*$/,"")).filter(s=>s.length>2&&!/^[a-z]{1,2}$/.test(s)).slice(0,2);if(i.length>0)return{name:i.join(" "),path:e}}return{name:n==="div"?"container":n,path:e}}return{name:n,path:e}}function Fa(t){let e=[],n=t.textContent?.trim();n&&n.length<100&&e.push(n);let l=t.previousElementSibling;if(l){let o=l.textContent?.trim();o&&o.length<50&&e.unshift(`[before: "${o.slice(0,40)}"]`)}let a=t.nextElementSibling;if(a){let o=a.textContent?.trim();o&&o.length<50&&e.push(`[after: "${o.slice(0,40)}"]`)}return e.join(" ")}function bi(t){let e=Jl(t);if(!e)return"";let a=(t.getRootNode()instanceof ShadowRoot&&t.parentElement?Array.from(t.parentElement.children):Array.from(e.children)).filter(h=>h!==t&&h instanceof HTMLElement);if(a.length===0)return"";let o=a.slice(0,4).map(h=>{let v=h.tagName.toLowerCase(),g=h.className,b="";if(typeof g=="string"&&g){let T=g.split(/\s+/).map(O=>O.replace(/[_][a-zA-Z0-9]{5,}.*$/,"")).find(O=>O.length>2&&!/^[a-z]{1,2}$/.test(O));T&&(b=`.${T}`)}if(v==="button"||v==="a"){let T=h.textContent?.trim().slice(0,15);if(T)return`${v}${b} "${T}"`}return`${v}${b}`}),s=e.tagName.toLowerCase();if(typeof e.className=="string"&&e.className){let h=e.className.split(/\s+/).map(v=>v.replace(/[_][a-zA-Z0-9]{5,}.*$/,"")).find(v=>v.length>2&&!/^[a-z]{1,2}$/.test(v));h&&(s=`.${h}`)}let u=e.children.length,m=u>o.length+1?` (${u} total in ${s})`:"";return o.join(", ")+m}function Pa(t){let e=t.className;return typeof e!="string"||!e?"":e.split(/\s+/).filter(l=>l.length>0).map(l=>{let a=l.match(/^([a-zA-Z][a-zA-Z0-9_-]*?)(?:_[a-zA-Z0-9]{5,})?$/);return a?a[1]:l}).filter((l,a,o)=>o.indexOf(l)===a).join(", ")}var M_=new Set(["none","normal","auto","0px","rgba(0, 0, 0, 0)","transparent","static","visible"]),v2=new Set(["p","span","h1","h2","h3","h4","h5","h6","label","li","td","th","blockquote","figcaption","caption","legend","dt","dd","pre","code","em","strong","b","i","a","time","cite","q"]),x2=new Set(["input","textarea","select"]),C2=new Set(["img","video","canvas","svg"]),S2=new Set(["div","section","article","nav","header","footer","aside","main","ul","ol","form","fieldset"]);function vi(t){if(typeof window>"u")return{};let e=window.getComputedStyle(t),n={},l=t.tagName.toLowerCase(),a;v2.has(l)?a=["color","fontSize","fontWeight","fontFamily","lineHeight"]:l==="button"||l==="a"&&t.getAttribute("role")==="button"?a=["backgroundColor","color","padding","borderRadius","fontSize"]:x2.has(l)?a=["backgroundColor","color","padding","borderRadius","fontSize"]:C2.has(l)?a=["width","height","objectFit","borderRadius"]:S2.has(l)?a=["display","padding","margin","gap","backgroundColor"]:a=["color","fontSize","margin","padding","backgroundColor"];for(let o of a){let i=o.replace(/([A-Z])/g,"-$1").toLowerCase(),s=e.getPropertyValue(i);s&&!M_.has(s)&&(n[o]=s)}return n}var w2=["color","backgroundColor","borderColor","fontSize","fontWeight","fontFamily","lineHeight","letterSpacing","textAlign","width","height","padding","margin","border","borderRadius","display","position","top","right","bottom","left","zIndex","flexDirection","justifyContent","alignItems","gap","opacity","visibility","overflow","boxShadow","transform"];function xi(t){if(typeof window>"u")return"";let e=window.getComputedStyle(t),n=[];for(let l of w2){let a=l.replace(/([A-Z])/g,"-$1").toLowerCase(),o=e.getPropertyValue(a);o&&!M_.has(o)&&n.push(`${a}: ${o}`)}return n.join("; ")}function E2(t){if(!t)return;let e={},n=t.split(";").map(l=>l.trim()).filter(Boolean);for(let l of n){let a=l.indexOf(":");if(a>0){let o=l.slice(0,a).trim(),i=l.slice(a+1).trim();o&&i&&(e[o]=i)}}return Object.keys(e).length>0?e:void 0}function Ci(t){let e=[],n=t.getAttribute("role"),l=t.getAttribute("aria-label"),a=t.getAttribute("aria-describedby"),o=t.getAttribute("tabindex"),i=t.getAttribute("aria-hidden");return n&&e.push(`role="${n}"`),l&&e.push(`aria-label="${l}"`),a&&e.push(`aria-describedby="${a}"`),o&&e.push(`tabindex=${o}`),i==="true"&&e.push("aria-hidden"),t.matches("a, button, input, select, textarea, [tabindex]")&&e.push("focusable"),e.join(", ")}function Si(t){let e=[],n=t;for(;n&&n.tagName.toLowerCase()!=="html";){let l=n.tagName.toLowerCase(),a=l;if(n.id)a=`${l}#${n.id}`;else if(n.className&&typeof n.className=="string"){let i=n.className.split(/\s+/).map(s=>s.replace(/[_][a-zA-Z0-9]{5,}.*$/,"")).find(s=>s.length>2);i&&(a=`${l}.${i}`)}let o=Jl(n);!n.parentElement&&o&&(a=`\u27E8shadow\u27E9 ${a}`),e.unshift(a),n=o}return e.join(" > ")}var Du="feedback-annotations-",z_=7;function Ti(t){return`${Du}${t}`}function Tu(t){if(typeof window>"u")return[];try{let e=localStorage.getItem(Ti(t));if(!e)return[];let n=JSON.parse(e),l=Date.now()-z_*24*60*60*1e3;return n.filter(a=>!a.timestamp||a.timestamp>l)}catch{return[]}}function L_(t,e){if(!(typeof window>"u"))try{localStorage.setItem(Ti(t),JSON.stringify(e))}catch{}}function T2(){let t=new Map;if(typeof window>"u")return t;try{let e=Date.now()-z_*24*60*60*1e3;for(let n=0;n<localStorage.length;n++){let l=localStorage.key(n);if(l?.startsWith(Du)){let a=l.slice(Du.length),o=localStorage.getItem(l);if(o){let s=JSON.parse(o).filter(u=>!u.timestamp||u.timestamp>e);s.length>0&&t.set(a,s)}}}}catch{}return t}function to(t,e,n){let l=e.map(a=>({...a,_syncedTo:n}));L_(t,l)}var A2="agentation-session-";function Bu(t){return`${A2}${t}`}function k2(t){if(typeof window>"u")return null;try{return localStorage.getItem(Bu(t))}catch{return null}}function Au(t,e){if(!(typeof window>"u"))try{localStorage.setItem(Bu(t),e)}catch{}}function M2(t){if(!(typeof window>"u"))try{localStorage.removeItem(Bu(t))}catch{}}async function ku(t,e){let n=await fetch(`${t}/sessions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:e})});if(!n.ok)throw new Error(`Failed to create session: ${n.status}`);return n.json()}async function x_(t,e){let n=await fetch(`${t}/sessions/${e}`);if(!n.ok)throw new Error(`Failed to get session: ${n.status}`);return n.json()}async function wi(t,e,n){let l=await fetch(`${t}/sessions/${e}/annotations`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)});if(!l.ok)throw new Error(`Failed to sync annotation: ${l.status}`);return l.json()}async function z2(t,e,n){let l=await fetch(`${t}/annotations/${e}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)});if(!l.ok)throw new Error(`Failed to update annotation: ${l.status}`);return l.json()}async function C_(t,e){let n=await fetch(`${t}/annotations/${e}`,{method:"DELETE"});if(!n.ok)throw new Error(`Failed to delete annotation: ${n.status}`)}var ut={FunctionComponent:0,ClassComponent:1,IndeterminateComponent:2,HostRoot:3,HostPortal:4,HostComponent:5,HostText:6,Fragment:7,Mode:8,ContextConsumer:9,ContextProvider:10,ForwardRef:11,Profiler:12,SuspenseComponent:13,MemoComponent:14,SimpleMemoComponent:15,LazyComponent:16,IncompleteClassComponent:17,DehydratedFragment:18,SuspenseListComponent:19,ScopeComponent:21,OffscreenComponent:22,LegacyHiddenComponent:23,CacheComponent:24,TracingMarkerComponent:25,HostHoistable:26,HostSingleton:27,IncompleteFunctionComponent:28,Throw:29,ViewTransitionComponent:30,ActivityComponent:31},S_=new Set(["Component","PureComponent","Fragment","Suspense","Profiler","StrictMode","Routes","Route","Outlet","Root","ErrorBoundaryHandler","HotReload","Hot"]),w_=[/Boundary$/,/BoundaryHandler$/,/Provider$/,/Consumer$/,/^(Inner|Outer)/,/Router$/,/^Client(Page|Segment|Root)/,/^Server(Root|Component|Render)/,/^RSC/,/Context$/,/^Hot(Reload)?$/,/^(Dev|React)(Overlay|Tools|Root)/,/Overlay$/,/Handler$/,/^With[A-Z]/,/Wrapper$/,/^Root$/],L2=[/Page$/,/View$/,/Screen$/,/Section$/,/Card$/,/List$/,/Item$/,/Form$/,/Modal$/,/Dialog$/,/Button$/,/Nav$/,/Header$/,/Footer$/,/Layout$/,/Panel$/,/Tab$/,/Menu$/];function N2(t){let e=t?.mode??"filtered",n=S_;if(t?.skipExact){let l=t.skipExact instanceof Set?t.skipExact:new Set(t.skipExact);n=new Set([...S_,...l])}return{maxComponents:t?.maxComponents??6,maxDepth:t?.maxDepth??30,mode:e,skipExact:n,skipPatterns:t?.skipPatterns?[...w_,...t.skipPatterns]:w_,userPatterns:t?.userPatterns??L2,filter:t?.filter}}function O2(t){return t.replace(/([a-z])([A-Z])/g,"$1-$2").replace(/([A-Z])([A-Z][a-z])/g,"$1-$2").toLowerCase()}function D2(t,e=10){let n=new Set,l=t,a=0;for(;l&&a<e;)l.className&&typeof l.className=="string"&&l.className.split(/\s+/).forEach(o=>{if(o.length>1){let i=o.replace(/[_][a-zA-Z0-9]{5,}.*$/,"").toLowerCase();i.length>1&&n.add(i)}}),l=l.parentElement,a++;return n}function B2(t,e){let n=O2(t);for(let l of e){if(l===n)return!0;let a=n.split("-").filter(i=>i.length>2),o=l.split("-").filter(i=>i.length>2);for(let i of a)for(let s of o)if(i===s||i.includes(s)||s.includes(i))return!0}return!1}function Y2(t,e,n,l){if(n.filter)return n.filter(t,e);switch(n.mode){case"all":return!0;case"filtered":return!(n.skipExact.has(t)||n.skipPatterns.some(a=>a.test(t)));case"smart":return n.skipExact.has(t)||n.skipPatterns.some(a=>a.test(t))?!1:!!(l&&B2(t,l)||n.userPatterns.some(a=>a.test(t)));default:return!0}}var Vl=null,H2=new WeakMap;function Mu(t){return Object.keys(t).some(e=>e.startsWith("__reactFiber$")||e.startsWith("__reactInternalInstance$")||e.startsWith("__reactProps$"))}function R2(){if(Vl!==null)return Vl;if(typeof document>"u")return!1;if(document.body&&Mu(document.body))return Vl=!0,!0;let t=["#root","#app","#__next","[data-reactroot]"];for(let e of t){let n=document.querySelector(e);if(n&&Mu(n))return Vl=!0,!0}if(document.body){for(let e of document.body.children)if(Mu(e))return Vl=!0,!0}return Vl=!1,!1}var eo={map:H2};function U2(t){return Object.keys(t).find(n=>n.startsWith("__reactFiber$")||n.startsWith("__reactInternalInstance$"))||null}function j2(t){let e=U2(t);return e?t[e]:null}function ml(t){return t?t.displayName?t.displayName:t.name?t.name:null:null}function X2(t){let{tag:e,type:n,elementType:l}=t;if(e===ut.HostComponent||e===ut.HostText||e===ut.HostHoistable||e===ut.HostSingleton||e===ut.Fragment||e===ut.Mode||e===ut.Profiler||e===ut.DehydratedFragment||e===ut.HostRoot||e===ut.HostPortal||e===ut.ScopeComponent||e===ut.OffscreenComponent||e===ut.LegacyHiddenComponent||e===ut.CacheComponent||e===ut.TracingMarkerComponent||e===ut.Throw||e===ut.ViewTransitionComponent||e===ut.ActivityComponent)return null;if(e===ut.ForwardRef){let a=l;if(a?.render){let o=ml(a.render);if(o)return o}return a?.displayName?a.displayName:ml(n)}if(e===ut.MemoComponent||e===ut.SimpleMemoComponent){let a=l;if(a?.type){let o=ml(a.type);if(o)return o}return a?.displayName?a.displayName:ml(n)}if(e===ut.ContextProvider){let a=n;return a?._context?.displayName?`${a._context.displayName}.Provider`:null}if(e===ut.ContextConsumer){let a=n;return a?.displayName?`${a.displayName}.Consumer`:null}if(e===ut.LazyComponent){let a=l;return a?._status===1&&a._result?ml(a._result):null}return e===ut.SuspenseComponent||e===ut.SuspenseListComponent?null:e===ut.IncompleteClassComponent||e===ut.IncompleteFunctionComponent||e===ut.FunctionComponent||e===ut.ClassComponent||e===ut.IndeterminateComponent?ml(n):null}function Q2(t){return t.length<=2||t.length<=3&&t===t.toLowerCase()}function q2(t,e){let n=N2(e),l=n.mode==="all";if(l){let u=eo.map.get(t);if(u!==void 0)return u}if(!R2()){let u={path:null,components:[]};return l&&eo.map.set(t,u),u}let a=n.mode==="smart"?D2(t):void 0,o=[];try{let u=j2(t),m=0;for(;u&&m<n.maxDepth&&o.length<n.maxComponents;){let h=X2(u);h&&!Q2(h)&&Y2(h,m,n,a)&&o.push(h),u=u.return,m++}}catch{let u={path:null,components:[]};return l&&eo.map.set(t,u),u}if(o.length===0){let u={path:null,components:[]};return l&&eo.map.set(t,u),u}let s={path:o.slice().reverse().map(u=>`<${u}>`).join(" "),components:o};return l&&eo.map.set(t,s),s}var Z2=`svg[fill=none] {
  fill: none !important;
}

@keyframes styles-module__toolbarEnter___u8RRu {
  from {
    opacity: 0;
    transform: scale(0.5) rotate(90deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}
@keyframes styles-module__badgeEnter___mVQLj {
  from {
    opacity: 0;
    transform: scale(0);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes styles-module__scaleIn___c-r1K {
  from {
    opacity: 0;
    transform: scale(0.85);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes styles-module__scaleOut___Wctwz {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.85);
  }
}
@keyframes styles-module__slideUp___kgD36 {
  from {
    opacity: 0;
    transform: scale(0.85) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
@keyframes styles-module__slideDown___zcdje {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.85) translateY(8px);
  }
}
@keyframes styles-module__markerIn___5FaAP {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.3);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
@keyframes styles-module__markerOut___GU5jX {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.3);
  }
}
@keyframes styles-module__fadeIn___b9qmf {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes styles-module__fadeOut___6Ut6- {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
@keyframes styles-module__tooltipIn___0N31w {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(2px) scale(0.891);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(0.909);
  }
}
@keyframes styles-module__hoverHighlightIn___6WYHY {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes styles-module__hoverTooltipIn___FYGQx {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
@keyframes styles-module__settingsPanelIn___MGfO8 {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.95);
    filter: blur(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0px);
  }
}
@keyframes styles-module__settingsPanelOut___Zfymi {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0px);
  }
  to {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
    filter: blur(5px);
  }
}
.styles-module__toolbar___wNsdK {
  position: fixed;
  bottom: 1.25rem;
  right: 1.25rem;
  width: 297px;
  z-index: 100000;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  pointer-events: none;
  transition: left 0s, top 0s, right 0s, bottom 0s;
}

.styles-module__toolbarContainer___dIhma {
  user-select: none;
  margin-left: auto;
  align-self: flex-end;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1a1a;
  color: #fff;
  border: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2), 0 4px 16px rgba(0, 0, 0, 0.1);
  pointer-events: auto;
  cursor: grab;
  transition: width 0.4s cubic-bezier(0.19, 1, 0.22, 1), transform 0.4s cubic-bezier(0.19, 1, 0.22, 1);
}
.styles-module__toolbarContainer___dIhma.styles-module__dragging___xrolZ {
  transition: width 0.4s cubic-bezier(0.19, 1, 0.22, 1);
  cursor: grabbing;
}
.styles-module__toolbarContainer___dIhma.styles-module__entrance___sgHd8 {
  animation: styles-module__toolbarEnter___u8RRu 0.5s cubic-bezier(0.34, 1.2, 0.64, 1) forwards;
}
.styles-module__toolbarContainer___dIhma.styles-module__collapsed___Rydsn {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  padding: 0;
  cursor: pointer;
}
.styles-module__toolbarContainer___dIhma.styles-module__collapsed___Rydsn svg {
  margin-top: -1px;
}
.styles-module__toolbarContainer___dIhma.styles-module__collapsed___Rydsn:hover {
  background: #2a2a2a;
}
.styles-module__toolbarContainer___dIhma.styles-module__collapsed___Rydsn:active {
  transform: scale(0.95);
}
.styles-module__toolbarContainer___dIhma.styles-module__expanded___ofKPx {
  height: 44px;
  border-radius: 1.5rem;
  padding: 0.375rem;
  width: 257px;
}
.styles-module__toolbarContainer___dIhma.styles-module__expanded___ofKPx.styles-module__serverConnected___Gfbou {
  width: 297px;
}

.styles-module__toggleContent___0yfyP {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.1s cubic-bezier(0.19, 1, 0.22, 1);
}
.styles-module__toggleContent___0yfyP.styles-module__visible___KHwEW {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}
.styles-module__toggleContent___0yfyP.styles-module__hidden___Ae8H4 {
  opacity: 0;
  pointer-events: none;
}

.styles-module__controlsContent___9GJWU {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  transition: filter 0.8s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.8s cubic-bezier(0.19, 1, 0.22, 1), transform 0.6s cubic-bezier(0.19, 1, 0.22, 1);
}
.styles-module__controlsContent___9GJWU.styles-module__visible___KHwEW {
  opacity: 1;
  filter: blur(0px);
  transform: scale(1);
  visibility: visible;
  pointer-events: auto;
}
.styles-module__controlsContent___9GJWU.styles-module__hidden___Ae8H4 {
  pointer-events: none;
  opacity: 0;
  filter: blur(10px);
  transform: scale(0.4);
}

.styles-module__badge___2XsgF {
  position: absolute;
  top: -13px;
  right: -13px;
  user-select: none;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #3c82f7;
  color: white;
  font-size: 0.625rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  opacity: 1;
  transition: transform 0.3s ease, opacity 0.2s ease;
  transform: scale(1);
}
.styles-module__badge___2XsgF.styles-module__fadeOut___6Ut6- {
  opacity: 0;
  transform: scale(0);
  pointer-events: none;
}
.styles-module__badge___2XsgF.styles-module__entrance___sgHd8 {
  animation: styles-module__badgeEnter___mVQLj 0.3s cubic-bezier(0.34, 1.2, 0.64, 1) 0.4s both;
}

.styles-module__controlButton___8Q0jc {
  position: relative;
  cursor: pointer !important;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease, opacity 0.2s ease;
}
.styles-module__controlButton___8Q0jc:hover:not(:disabled):not([data-active=true]):not([data-failed=true]):not([data-auto-sync=true]):not([data-error=true]):not([data-no-hover=true]) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
.styles-module__controlButton___8Q0jc:active:not(:disabled) {
  transform: scale(0.92);
}
.styles-module__controlButton___8Q0jc:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.styles-module__controlButton___8Q0jc[data-active=true] {
  color: #3c82f7;
  background: rgba(60, 130, 247, 0.25);
}
.styles-module__controlButton___8Q0jc[data-error=true] {
  color: #ff3b30;
  background: rgba(255, 59, 48, 0.25);
}
.styles-module__controlButton___8Q0jc[data-danger]:hover:not(:disabled):not([data-active=true]):not([data-failed=true]) {
  background: rgba(255, 59, 48, 0.25);
  color: #ff3b30;
}
.styles-module__controlButton___8Q0jc[data-no-hover=true], .styles-module__controlButton___8Q0jc.styles-module__statusShowing___te6iu {
  cursor: default !important;
  pointer-events: none;
  background: transparent !important;
}
.styles-module__controlButton___8Q0jc[data-auto-sync=true] {
  color: #34c759;
  background: transparent;
  cursor: default;
}
.styles-module__controlButton___8Q0jc[data-failed=true] {
  color: #ff3b30;
  background: rgba(255, 59, 48, 0.25);
}

.styles-module__buttonBadge___NeFWb {
  position: absolute;
  top: 0px;
  right: 0px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #3c82f7;
  color: white;
  font-size: 0.625rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 2px #1a1a1a, 0 1px 3px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}
.styles-module__buttonBadge___NeFWb.styles-module__light___r6n4Y {
  box-shadow: 0 0 0 2px #fff, 0 1px 3px rgba(0, 0, 0, 0.2);
}

@keyframes styles-module__mcpIndicatorPulseConnected___EDodZ {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.5);
  }
  50% {
    box-shadow: 0 0 0 5px rgba(52, 199, 89, 0);
  }
}
@keyframes styles-module__mcpIndicatorPulseConnecting___cCYte {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(245, 166, 35, 0.5);
  }
  50% {
    box-shadow: 0 0 0 5px rgba(245, 166, 35, 0);
  }
}
.styles-module__mcpIndicator___zGJeL {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  pointer-events: none;
  transition: background 0.3s ease, opacity 0.15s ease, transform 0.15s ease;
  opacity: 1;
  transform: scale(1);
}
.styles-module__mcpIndicator___zGJeL.styles-module__connected___7c28g {
  background: #34c759;
  animation: styles-module__mcpIndicatorPulseConnected___EDodZ 2.5s ease-in-out infinite;
}
.styles-module__mcpIndicator___zGJeL.styles-module__connecting___uo-CW {
  background: #f5a623;
  animation: styles-module__mcpIndicatorPulseConnecting___cCYte 1.5s ease-in-out infinite;
}
.styles-module__mcpIndicator___zGJeL.styles-module__hidden___Ae8H4 {
  opacity: 0;
  transform: scale(0);
  animation: none;
}

@keyframes styles-module__connectionPulse___-Zycw {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(0.9);
  }
}
.styles-module__connectionIndicatorWrapper___L-e-3 {
  width: 8px;
  height: 34px;
  margin-left: 6px;
  margin-right: 6px;
}

.styles-module__connectionIndicator___afk9p {
  position: relative;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.3s ease, background 0.3s ease;
  cursor: default;
}

.styles-module__connectionIndicatorVisible___C-i5B {
  opacity: 1;
}

.styles-module__connectionIndicatorConnected___IY8pR {
  background: #34c759;
  animation: styles-module__connectionPulse___-Zycw 2.5s ease-in-out infinite;
}

.styles-module__connectionIndicatorDisconnected___kmpaZ {
  background: #ff3b30;
  animation: none;
}

.styles-module__connectionIndicatorConnecting___QmSLH {
  background: #f59e0b;
  animation: styles-module__connectionPulse___-Zycw 1s ease-in-out infinite;
}

.styles-module__buttonWrapper___rBcdv {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.styles-module__buttonWrapper___rBcdv:hover .styles-module__buttonTooltip___Burd9 {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) scale(1);
  transition-delay: 0.85s;
}
.styles-module__buttonWrapper___rBcdv:has(.styles-module__controlButton___8Q0jc:disabled):hover .styles-module__buttonTooltip___Burd9 {
  opacity: 0;
  visibility: hidden;
}

.styles-module__sendButtonWrapper___UUxG6 {
  width: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  margin-left: -0.375rem;
  transition: width 0.4s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.3s cubic-bezier(0.19, 1, 0.22, 1), margin 0.4s cubic-bezier(0.19, 1, 0.22, 1);
}
.styles-module__sendButtonWrapper___UUxG6 .styles-module__controlButton___8Q0jc {
  transform: scale(0.8);
  transition: transform 0.4s cubic-bezier(0.19, 1, 0.22, 1);
}
.styles-module__sendButtonWrapper___UUxG6.styles-module__sendButtonVisible___WPSQU {
  width: 34px;
  opacity: 1;
  overflow: visible;
  pointer-events: auto;
  margin-left: 0;
}
.styles-module__sendButtonWrapper___UUxG6.styles-module__sendButtonVisible___WPSQU .styles-module__controlButton___8Q0jc {
  transform: scale(1);
}

.styles-module__buttonTooltip___Burd9 {
  position: absolute;
  bottom: calc(100% + 14px);
  left: 50%;
  transform: translateX(-50%) scale(0.95);
  padding: 6px 10px;
  background: #1a1a1a;
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-weight: 500;
  border-radius: 8px;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  z-index: 100001;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: opacity 0.135s ease, transform 0.135s ease, visibility 0.135s ease;
}
.styles-module__buttonTooltip___Burd9::after {
  content: "";
  position: absolute;
  top: calc(100% - 4px);
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 8px;
  height: 8px;
  background: #1a1a1a;
  border-radius: 0 0 2px 0;
}

.styles-module__shortcut___lEAQk {
  margin-left: 4px;
  opacity: 0.5;
}

.styles-module__tooltipBelow___m6ats .styles-module__buttonTooltip___Burd9 {
  bottom: auto;
  top: calc(100% + 14px);
  transform: translateX(-50%) scale(0.95);
}
.styles-module__tooltipBelow___m6ats .styles-module__buttonTooltip___Burd9::after {
  top: -4px;
  bottom: auto;
  border-radius: 2px 0 0 0;
}

.styles-module__tooltipBelow___m6ats .styles-module__buttonWrapper___rBcdv:hover .styles-module__buttonTooltip___Burd9 {
  transform: translateX(-50%) scale(1);
}

.styles-module__tooltipsHidden___VtLJG .styles-module__buttonTooltip___Burd9 {
  opacity: 0 !important;
  visibility: hidden !important;
  transition: none !important;
}

.styles-module__tooltipVisible___0jcCv,
.styles-module__tooltipsHidden___VtLJG .styles-module__tooltipVisible___0jcCv {
  opacity: 1 !important;
  visibility: visible !important;
  transform: translateX(-50%) scale(1) !important;
  transition-delay: 0s !important;
}

.styles-module__buttonWrapperAlignLeft___myzIp .styles-module__buttonTooltip___Burd9 {
  left: 50%;
  transform: translateX(-12px) scale(0.95);
}
.styles-module__buttonWrapperAlignLeft___myzIp .styles-module__buttonTooltip___Burd9::after {
  left: 16px;
}
.styles-module__buttonWrapperAlignLeft___myzIp:hover .styles-module__buttonTooltip___Burd9 {
  transform: translateX(-12px) scale(1);
}

.styles-module__tooltipBelow___m6ats .styles-module__buttonWrapperAlignLeft___myzIp .styles-module__buttonTooltip___Burd9 {
  transform: translateX(-12px) scale(0.95);
}
.styles-module__tooltipBelow___m6ats .styles-module__buttonWrapperAlignLeft___myzIp:hover .styles-module__buttonTooltip___Burd9 {
  transform: translateX(-12px) scale(1);
}

.styles-module__buttonWrapperAlignRight___HCQFR .styles-module__buttonTooltip___Burd9 {
  left: 50%;
  transform: translateX(calc(-100% + 12px)) scale(0.95);
}
.styles-module__buttonWrapperAlignRight___HCQFR .styles-module__buttonTooltip___Burd9::after {
  left: auto;
  right: 8px;
}
.styles-module__buttonWrapperAlignRight___HCQFR:hover .styles-module__buttonTooltip___Burd9 {
  transform: translateX(calc(-100% + 12px)) scale(1);
}

.styles-module__tooltipBelow___m6ats .styles-module__buttonWrapperAlignRight___HCQFR .styles-module__buttonTooltip___Burd9 {
  transform: translateX(calc(-100% + 12px)) scale(0.95);
}
.styles-module__tooltipBelow___m6ats .styles-module__buttonWrapperAlignRight___HCQFR:hover .styles-module__buttonTooltip___Burd9 {
  transform: translateX(calc(-100% + 12px)) scale(1);
}

.styles-module__divider___c--s1 {
  width: 1px;
  height: 12px;
  background: rgba(255, 255, 255, 0.15);
  margin: 0 0.125rem;
}

.styles-module__overlay___Q1O9y {
  position: fixed;
  inset: 0;
  z-index: 99997;
  pointer-events: none;
}
.styles-module__overlay___Q1O9y > * {
  pointer-events: auto;
}

.styles-module__hoverHighlight___ogakW {
  position: fixed;
  border: 2px solid rgba(60, 130, 247, 0.5);
  border-radius: 4px;
  pointer-events: none !important;
  background: rgba(60, 130, 247, 0.04);
  box-sizing: border-box;
  will-change: opacity;
  contain: layout style;
}
.styles-module__hoverHighlight___ogakW.styles-module__enter___WFIki {
  animation: styles-module__hoverHighlightIn___6WYHY 0.12s ease-out forwards;
}

.styles-module__multiSelectOutline___cSJ-m {
  position: fixed;
  border: 2px dashed rgba(52, 199, 89, 0.6);
  border-radius: 4px;
  pointer-events: none !important;
  background: rgba(52, 199, 89, 0.05);
  box-sizing: border-box;
  will-change: opacity;
}
.styles-module__multiSelectOutline___cSJ-m.styles-module__enter___WFIki {
  animation: styles-module__fadeIn___b9qmf 0.15s ease-out forwards;
}
.styles-module__multiSelectOutline___cSJ-m.styles-module__exit___fyOJ0 {
  animation: styles-module__fadeOut___6Ut6- 0.15s ease-out forwards;
}

.styles-module__singleSelectOutline___QhX-O {
  position: fixed;
  border: 2px solid rgba(60, 130, 247, 0.6);
  border-radius: 4px;
  pointer-events: none !important;
  background: rgba(60, 130, 247, 0.05);
  box-sizing: border-box;
  will-change: opacity;
}
.styles-module__singleSelectOutline___QhX-O.styles-module__enter___WFIki {
  animation: styles-module__fadeIn___b9qmf 0.15s ease-out forwards;
}
.styles-module__singleSelectOutline___QhX-O.styles-module__exit___fyOJ0 {
  animation: styles-module__fadeOut___6Ut6- 0.15s ease-out forwards;
}

.styles-module__hoverTooltip___bvLk7 {
  position: fixed;
  font-size: 0.6875rem;
  font-weight: 500;
  color: #fff;
  background: rgba(0, 0, 0, 0.85);
  padding: 0.35rem 0.6rem;
  border-radius: 0.375rem;
  pointer-events: none !important;
  white-space: nowrap;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.styles-module__hoverTooltip___bvLk7.styles-module__enter___WFIki {
  animation: styles-module__hoverTooltipIn___FYGQx 0.1s ease-out forwards;
}

.styles-module__hoverReactPath___gx1IJ {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.15rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.styles-module__hoverElementName___QMLMl {
  overflow: hidden;
  text-overflow: ellipsis;
}

.styles-module__markersLayer___-25j1 {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 0;
  z-index: 99998;
  pointer-events: none;
}
.styles-module__markersLayer___-25j1 > * {
  pointer-events: auto;
}

.styles-module__fixedMarkersLayer___ffyX6 {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99998;
  pointer-events: none;
}
.styles-module__fixedMarkersLayer___ffyX6 > * {
  pointer-events: auto;
}

.styles-module__marker___6sQrs {
  position: absolute;
  width: 22px;
  height: 22px;
  background: #3c82f7;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6875rem;
  font-weight: 600;
  transform: translate(-50%, -50%) scale(1);
  opacity: 1;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2), inset 0 0 0 1px rgba(0, 0, 0, 0.04);
  user-select: none;
  will-change: transform, opacity;
  contain: layout style;
  z-index: 1;
}
.styles-module__marker___6sQrs:hover {
  z-index: 2;
}
.styles-module__marker___6sQrs:not(.styles-module__enter___WFIki):not(.styles-module__exit___fyOJ0):not(.styles-module__clearing___FQ--7) {
  transition: background-color 0.15s ease, transform 0.1s ease;
}
.styles-module__marker___6sQrs.styles-module__enter___WFIki {
  animation: styles-module__markerIn___5FaAP 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.styles-module__marker___6sQrs.styles-module__exit___fyOJ0 {
  animation: styles-module__markerOut___GU5jX 0.2s ease-out both;
  pointer-events: none;
}
.styles-module__marker___6sQrs.styles-module__clearing___FQ--7 {
  animation: styles-module__markerOut___GU5jX 0.15s ease-out both;
  pointer-events: none;
}
.styles-module__marker___6sQrs:not(.styles-module__enter___WFIki):not(.styles-module__exit___fyOJ0):not(.styles-module__clearing___FQ--7):hover {
  transform: translate(-50%, -50%) scale(1.1);
}
.styles-module__marker___6sQrs.styles-module__pending___2IHLC {
  position: fixed;
  background: #3c82f7;
}
.styles-module__marker___6sQrs.styles-module__fixed___dBMHC {
  position: fixed;
}
.styles-module__marker___6sQrs.styles-module__multiSelect___YWiuz {
  background: #34c759;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  font-size: 0.75rem;
}
.styles-module__marker___6sQrs.styles-module__multiSelect___YWiuz.styles-module__pending___2IHLC {
  background: #34c759;
}
.styles-module__marker___6sQrs.styles-module__hovered___ZgXIy {
  background: #ff3b30;
}

.styles-module__renumber___nCTxD {
  display: block;
  animation: styles-module__renumberRoll___Wgbq3 0.2s ease-out;
}

@keyframes styles-module__renumberRoll___Wgbq3 {
  0% {
    transform: translateX(-40%);
    opacity: 0;
  }
  100% {
    transform: translateX(0);
    opacity: 1;
  }
}
.styles-module__markerTooltip___aLJID {
  position: absolute;
  top: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%) scale(0.909);
  z-index: 100002;
  background: #1a1a1a;
  padding: 8px 0.75rem;
  border-radius: 0.75rem;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-weight: 400;
  color: #fff;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.08);
  min-width: 120px;
  max-width: 200px;
  pointer-events: none;
  cursor: default;
}
.styles-module__markerTooltip___aLJID.styles-module__enter___WFIki {
  animation: styles-module__tooltipIn___0N31w 0.1s ease-out forwards;
}

.styles-module__markerQuote___FHmrz {
  display: block;
  font-size: 12px;
  font-style: italic;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.3125rem;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.styles-module__markerNote___QkrrS {
  display: block;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-bottom: 2px;
}

.styles-module__markerHint___2iF-6 {
  display: block;
  font-size: 0.625rem;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 0.375rem;
  white-space: nowrap;
}

.styles-module__settingsPanel___OxX3Y {
  position: absolute;
  right: 5px;
  bottom: calc(100% + 0.5rem);
  z-index: 1;
  overflow: hidden;
  background: #1c1c1c;
  border-radius: 1rem;
  padding: 13px 0 16px;
  min-width: 205px;
  cursor: default;
  opacity: 1;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.04);
  transition: background 0.25s ease, box-shadow 0.25s ease;
}
.styles-module__settingsPanel___OxX3Y::before, .styles-module__settingsPanel___OxX3Y::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: 16px;
  z-index: 2;
  pointer-events: none;
}
.styles-module__settingsPanel___OxX3Y::before {
  left: 0;
  background: linear-gradient(to right, #1c1c1c 0%, transparent 100%);
}
.styles-module__settingsPanel___OxX3Y::after {
  right: 0;
  background: linear-gradient(to left, #1c1c1c 0%, transparent 100%);
}
.styles-module__settingsPanel___OxX3Y .styles-module__settingsHeader___pwDY9,
.styles-module__settingsPanel___OxX3Y .styles-module__settingsBrand___0gJeM,
.styles-module__settingsPanel___OxX3Y .styles-module__settingsBrandSlash___uTG18,
.styles-module__settingsPanel___OxX3Y .styles-module__settingsVersion___TUcFq,
.styles-module__settingsPanel___OxX3Y .styles-module__settingsSection___m-YM2,
.styles-module__settingsPanel___OxX3Y .styles-module__settingsLabel___8UjfX,
.styles-module__settingsPanel___OxX3Y .styles-module__cycleButton___FMKfw,
.styles-module__settingsPanel___OxX3Y .styles-module__cycleDot___nPgLY,
.styles-module__settingsPanel___OxX3Y .styles-module__dropdownButton___16NPz,
.styles-module__settingsPanel___OxX3Y .styles-module__toggleLabel___Xm8Aa,
.styles-module__settingsPanel___OxX3Y .styles-module__customCheckbox___U39ax,
.styles-module__settingsPanel___OxX3Y .styles-module__sliderLabel___U8sPr,
.styles-module__settingsPanel___OxX3Y .styles-module__slider___GLdxp,
.styles-module__settingsPanel___OxX3Y .styles-module__helpIcon___xQg56,
.styles-module__settingsPanel___OxX3Y .styles-module__themeToggle___2rUjA {
  transition: background 0.25s ease, color 0.25s ease, border-color 0.25s ease;
}
.styles-module__settingsPanel___OxX3Y.styles-module__enter___WFIki {
  opacity: 1;
  transform: translateY(0) scale(1);
  filter: blur(0px);
  transition: opacity 0.2s ease, transform 0.2s ease, filter 0.2s ease;
}
.styles-module__settingsPanel___OxX3Y.styles-module__exit___fyOJ0 {
  opacity: 0;
  transform: translateY(8px) scale(0.95);
  filter: blur(5px);
  pointer-events: none;
  transition: opacity 0.1s ease, transform 0.1s ease, filter 0.1s ease;
}
.styles-module__settingsPanel___OxX3Y.styles-module__dark___ILIQf {
  background: #1a1a1a;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.08);
}
.styles-module__settingsPanel___OxX3Y.styles-module__dark___ILIQf .styles-module__settingsLabel___8UjfX {
  color: rgba(255, 255, 255, 0.6);
}
.styles-module__settingsPanel___OxX3Y.styles-module__dark___ILIQf .styles-module__settingsOption___UNa12 {
  color: rgba(255, 255, 255, 0.85);
}
.styles-module__settingsPanel___OxX3Y.styles-module__dark___ILIQf .styles-module__settingsOption___UNa12:hover {
  background: rgba(255, 255, 255, 0.1);
}
.styles-module__settingsPanel___OxX3Y.styles-module__dark___ILIQf .styles-module__settingsOption___UNa12.styles-module__selected___OwRqP {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}
.styles-module__settingsPanel___OxX3Y.styles-module__dark___ILIQf .styles-module__toggleLabel___Xm8Aa {
  color: rgba(255, 255, 255, 0.85);
}

.styles-module__settingsPanelContainer___Xksv8 {
  overflow: visible;
  position: relative;
  display: flex;
  padding: 0 1rem;
}
.styles-module__settingsPanelContainer___Xksv8.styles-module__transitioning___qxzCk {
  overflow-x: clip;
  overflow-y: visible;
}

.styles-module__settingsPage___6YfHH {
  min-width: 100%;
  flex-shrink: 0;
  transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease-out;
  opacity: 1;
}

.styles-module__settingsPage___6YfHH.styles-module__slideLeft___Ps01J {
  transform: translateX(-100%);
  opacity: 0;
}

.styles-module__automationsPage___uvCq6 {
  position: absolute;
  top: 0;
  left: 100%;
  width: 100%;
  height: 100%;
  padding: 3px 1rem 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease-out 0.1s;
  opacity: 0;
}

.styles-module__automationsPage___uvCq6.styles-module__slideIn___4-qXe {
  transform: translateX(-100%);
  opacity: 1;
}

.styles-module__settingsNavLink___wCzJt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: color 0.15s ease;
}
.styles-module__settingsNavLink___wCzJt:hover {
  color: rgba(255, 255, 255, 0.9);
}
.styles-module__settingsNavLink___wCzJt.styles-module__light___r6n4Y {
  color: rgba(0, 0, 0, 0.5);
}
.styles-module__settingsNavLink___wCzJt.styles-module__light___r6n4Y:hover {
  color: rgba(0, 0, 0, 0.8);
}
.styles-module__settingsNavLink___wCzJt svg {
  color: rgba(255, 255, 255, 0.4);
  transition: color 0.15s ease;
}
.styles-module__settingsNavLink___wCzJt:hover svg {
  color: #fff;
}
.styles-module__settingsNavLink___wCzJt.styles-module__light___r6n4Y svg {
  color: rgba(0, 0, 0, 0.25);
}
.styles-module__settingsNavLink___wCzJt.styles-module__light___r6n4Y:hover svg {
  color: rgba(0, 0, 0, 0.8);
}

.styles-module__settingsNavLinkRight___ZWwhj {
  display: flex;
  align-items: center;
  gap: 6px;
}

.styles-module__mcpNavIndicator___cl9pO {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.styles-module__mcpNavIndicator___cl9pO.styles-module__connected___7c28g {
  background: #34c759;
  animation: styles-module__mcpPulse___uNggr 2.5s ease-in-out infinite;
}
.styles-module__mcpNavIndicator___cl9pO.styles-module__connecting___uo-CW {
  background: #f5a623;
  animation: styles-module__mcpPulse___uNggr 1.5s ease-in-out infinite;
}

.styles-module__settingsBackButton___bIe2j {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 0 12px 0;
  margin: -6px 0 0.5rem 0;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 0;
  background: transparent;
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: -0.15px;
  color: #fff;
  cursor: pointer;
  transition: transform 0.12s cubic-bezier(0.32, 0.72, 0, 1);
}
.styles-module__settingsBackButton___bIe2j svg {
  opacity: 0.4;
  flex-shrink: 0;
  transition: opacity 0.15s ease, transform 0.18s cubic-bezier(0.32, 0.72, 0, 1);
}
.styles-module__settingsBackButton___bIe2j:hover svg {
  opacity: 1;
}
.styles-module__settingsBackButton___bIe2j.styles-module__light___r6n4Y {
  color: rgba(0, 0, 0, 0.85);
  border-bottom-color: rgba(0, 0, 0, 0.08);
}

.styles-module__automationHeader___InP0r {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  font-size: 0.8125rem;
  font-weight: 400;
  color: #fff;
}
.styles-module__automationHeader___InP0r .styles-module__helpIcon___xQg56 svg {
  transform: none;
}
.styles-module__automationHeader___InP0r.styles-module__light___r6n4Y {
  color: rgba(0, 0, 0, 0.85);
}

.styles-module__automationDescription___NKlmo {
  font-size: 0.6875rem;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
  line-height: 14px;
}
.styles-module__automationDescription___NKlmo.styles-module__light___r6n4Y {
  color: rgba(0, 0, 0, 0.5);
}

.styles-module__learnMoreLink___8xv-x {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: underline dotted;
  text-decoration-color: rgba(255, 255, 255, 0.2);
  text-underline-offset: 2px;
  transition: color 0.15s ease;
}
.styles-module__learnMoreLink___8xv-x:hover {
  color: #fff;
}
.styles-module__learnMoreLink___8xv-x.styles-module__light___r6n4Y {
  color: rgba(0, 0, 0, 0.6);
  text-decoration-color: rgba(0, 0, 0, 0.2);
}
.styles-module__learnMoreLink___8xv-x.styles-module__light___r6n4Y:hover {
  color: rgba(0, 0, 0, 0.85);
}

.styles-module__autoSendRow___UblX5 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.styles-module__autoSendLabel___icDc2 {
  font-size: 0.6875rem;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.4);
  transition: color 0.15s ease;
}
.styles-module__autoSendLabel___icDc2.styles-module__active___-zoN6 {
  color: #66b8ff;
}
.styles-module__autoSendLabel___icDc2.styles-module__light___r6n4Y {
  color: rgba(0, 0, 0, 0.4);
}
.styles-module__autoSendLabel___icDc2.styles-module__light___r6n4Y.styles-module__active___-zoN6 {
  color: #3c82f7;
}

.styles-module__webhookUrlInput___2375C {
  display: block;
  width: 100%;
  flex: 1;
  min-height: 60px;
  box-sizing: border-box;
  margin-top: 11px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 400;
  color: #fff;
  outline: none;
  resize: none;
  cursor: text !important;
  user-select: text;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.styles-module__webhookUrlInput___2375C::placeholder {
  color: rgba(255, 255, 255, 0.3);
}
.styles-module__webhookUrlInput___2375C:focus {
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
}
.styles-module__webhookUrlInput___2375C.styles-module__light___r6n4Y {
  border-color: rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.03);
  color: rgba(0, 0, 0, 0.85);
}
.styles-module__webhookUrlInput___2375C.styles-module__light___r6n4Y::placeholder {
  color: rgba(0, 0, 0, 0.3);
}
.styles-module__webhookUrlInput___2375C.styles-module__light___r6n4Y:focus {
  border-color: rgba(0, 0, 0, 0.25);
  background: rgba(0, 0, 0, 0.05);
}

.styles-module__settingsHeader___pwDY9 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
  margin-bottom: 0.5rem;
  padding-bottom: 9px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.styles-module__settingsBrand___0gJeM {
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: -0.0094em;
  color: #fff;
}

.styles-module__settingsBrandSlash___uTG18 {
  color: rgba(255, 255, 255, 0.5);
}

.styles-module__settingsVersion___TUcFq {
  font-size: 11px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.4);
  margin-left: auto;
  letter-spacing: -0.0094em;
}

.styles-module__settingsSection___m-YM2 + .styles-module__settingsSection___m-YM2 {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}
.styles-module__settingsSection___m-YM2.styles-module__settingsSectionExtraPadding___jdhFV {
  padding-top: calc(0.5rem + 4px);
}

.styles-module__settingsSectionGrow___h-5HZ {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.styles-module__settingsRow___3sdhc {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
}
.styles-module__settingsRow___3sdhc.styles-module__settingsRowMarginTop___zA0Sp {
  margin-top: 8px;
}

.styles-module__dropdownContainer___BVnxe {
  position: relative;
}

.styles-module__dropdownButton___16NPz {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  letter-spacing: -0.0094em;
}
.styles-module__dropdownButton___16NPz:hover {
  background: rgba(255, 255, 255, 0.08);
}
.styles-module__dropdownButton___16NPz svg {
  opacity: 0.6;
}

.styles-module__cycleButton___FMKfw {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #fff;
  cursor: pointer;
  letter-spacing: -0.0094em;
}
.styles-module__cycleButton___FMKfw.styles-module__light___r6n4Y {
  color: rgba(0, 0, 0, 0.85);
}
.styles-module__cycleButton___FMKfw:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.styles-module__settingsRowDisabled___EgS0V .styles-module__settingsLabel___8UjfX {
  color: rgba(255, 255, 255, 0.2);
}
.styles-module__settingsRowDisabled___EgS0V .styles-module__settingsLabel___8UjfX.styles-module__light___r6n4Y {
  color: rgba(0, 0, 0, 0.2);
}
.styles-module__settingsRowDisabled___EgS0V .styles-module__toggleSwitch___l4Ygm {
  opacity: 0.4;
  cursor: not-allowed;
}

@keyframes styles-module__cycleTextIn___Q6zJf {
  0% {
    opacity: 0;
    transform: translateY(-6px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}
.styles-module__cycleButtonText___fD1LR {
  display: inline-block;
  animation: styles-module__cycleTextIn___Q6zJf 0.2s ease-out;
}

.styles-module__cycleDots___LWuoQ {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.styles-module__cycleDot___nPgLY {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transform: scale(0.667);
  transition: background-color 0.25s ease-out, transform 0.25s ease-out;
}
.styles-module__cycleDot___nPgLY.styles-module__active___-zoN6 {
  background: #fff;
  transform: scale(1);
}
.styles-module__cycleDot___nPgLY.styles-module__light___r6n4Y {
  background: rgba(0, 0, 0, 0.2);
}
.styles-module__cycleDot___nPgLY.styles-module__light___r6n4Y.styles-module__active___-zoN6 {
  background: rgba(0, 0, 0, 0.7);
}

.styles-module__dropdownMenu___k73ER {
  position: absolute;
  right: 0;
  top: calc(100% + 0.25rem);
  background: #1a1a1a;
  border-radius: 0.5rem;
  padding: 0.25rem;
  min-width: 120px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
  z-index: 10;
  animation: styles-module__scaleIn___c-r1K 0.15s ease-out;
}

.styles-module__dropdownItem___ylsLj {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 0.5rem 0.625rem;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease, color 0.15s ease;
  letter-spacing: -0.0094em;
}
.styles-module__dropdownItem___ylsLj:hover {
  background: rgba(255, 255, 255, 0.08);
}
.styles-module__dropdownItem___ylsLj.styles-module__selected___OwRqP {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-weight: 600;
}

.styles-module__settingsLabel___8UjfX {
  font-size: 0.8125rem;
  font-weight: 400;
  letter-spacing: -0.0094em;
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  gap: 0.125rem;
}
.styles-module__settingsLabel___8UjfX.styles-module__light___r6n4Y {
  color: rgba(0, 0, 0, 0.5);
}

.styles-module__settingsLabelMarker___ewdtV {
  padding-top: 3px;
  margin-bottom: 10px;
}

.styles-module__settingsOptions___LyrBA {
  display: flex;
  gap: 0.25rem;
}

.styles-module__settingsOption___UNa12 {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.375rem 0.5rem;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  font-size: 0.6875rem;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.7);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.styles-module__settingsOption___UNa12:hover {
  background: rgba(0, 0, 0, 0.05);
}
.styles-module__settingsOption___UNa12.styles-module__selected___OwRqP {
  background: rgba(60, 130, 247, 0.15);
  color: #3c82f7;
}

.styles-module__sliderContainer___ducXj {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.styles-module__slider___GLdxp {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}
.styles-module__slider___GLdxp::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: white;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.styles-module__slider___GLdxp::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: white;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.styles-module__slider___GLdxp:hover::-webkit-slider-thumb {
  transform: scale(1.15);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}
.styles-module__slider___GLdxp:hover::-moz-range-thumb {
  transform: scale(1.15);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

.styles-module__sliderLabels___FhLDB {
  display: flex;
  justify-content: space-between;
}

.styles-module__sliderLabel___U8sPr {
  font-size: 0.625rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  transition: color 0.15s ease;
}
.styles-module__sliderLabel___U8sPr:hover {
  color: rgba(255, 255, 255, 0.7);
}
.styles-module__sliderLabel___U8sPr.styles-module__active___-zoN6 {
  color: rgba(255, 255, 255, 0.9);
}

.styles-module__colorOptions___iHCNX {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.375rem;
  margin-bottom: 1px;
}

.styles-module__colorOption___IodiY {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.25, 1, 0.5, 1);
}
.styles-module__colorOption___IodiY:hover {
  transform: scale(1.15);
}
.styles-module__colorOption___IodiY.styles-module__selected___OwRqP {
  transform: scale(0.83);
}

.styles-module__colorOptionRing___U2xpo {
  display: flex;
  width: 24px;
  height: 24px;
  border: 2px solid transparent;
  border-radius: 50%;
  transition: border-color 0.3s ease;
}
.styles-module__settingsToggle___fBrFn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}
.styles-module__settingsToggle___fBrFn + .styles-module__settingsToggle___fBrFn {
  margin-top: calc(0.5rem + 6px);
}
.styles-module__settingsToggle___fBrFn input[type=checkbox] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.styles-module__settingsToggle___fBrFn.styles-module__settingsToggleMarginBottom___MZUyF {
  margin-bottom: calc(0.5rem + 6px);
}

.styles-module__customCheckbox___U39ax {
  position: relative;
  width: 14px;
  height: 14px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.25s ease, border-color 0.25s ease;
}
.styles-module__customCheckbox___U39ax svg {
  color: #1a1a1a;
  opacity: 1;
  transition: opacity 0.15s ease;
}
input[type=checkbox]:checked + .styles-module__customCheckbox___U39ax {
  border-color: rgba(255, 255, 255, 0.3);
  background: rgb(255, 255, 255);
}
.styles-module__customCheckbox___U39ax.styles-module__light___r6n4Y {
  border: 1px solid rgba(0, 0, 0, 0.15);
  background: #fff;
}
.styles-module__customCheckbox___U39ax.styles-module__light___r6n4Y.styles-module__checked___mnZLo {
  border-color: #1a1a1a;
  background: #1a1a1a;
}
.styles-module__customCheckbox___U39ax.styles-module__light___r6n4Y.styles-module__checked___mnZLo svg {
  color: #fff;
}

.styles-module__toggleLabel___Xm8Aa {
  font-size: 0.8125rem;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: -0.0094em;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.styles-module__toggleLabel___Xm8Aa.styles-module__light___r6n4Y {
  color: rgba(0, 0, 0, 0.5);
}

.styles-module__toggleSwitch___l4Ygm {
  position: relative;
  display: inline-block;
  width: 24px;
  height: 16px;
  flex-shrink: 0;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.styles-module__toggleSwitch___l4Ygm input {
  opacity: 0;
  width: 0;
  height: 0;
}
.styles-module__toggleSwitch___l4Ygm input:checked + .styles-module__toggleSlider___wprIn {
  background: #3c82f7;
}
.styles-module__toggleSwitch___l4Ygm input:checked + .styles-module__toggleSlider___wprIn::before {
  transform: translateX(8px);
}
.styles-module__toggleSwitch___l4Ygm.styles-module__disabled___332Jw {
  opacity: 0.4;
  pointer-events: none;
}
.styles-module__toggleSwitch___l4Ygm.styles-module__disabled___332Jw .styles-module__toggleSlider___wprIn {
  cursor: not-allowed;
}

.styles-module__toggleSlider___wprIn {
  position: absolute;
  cursor: pointer;
  inset: 0;
  border-radius: 16px;
  background: #484848;
}
.styles-module__light___r6n4Y .styles-module__toggleSlider___wprIn {
  background: #dddddd;
}
.styles-module__toggleSlider___wprIn::before {
  content: "";
  position: absolute;
  height: 12px;
  width: 12px;
  left: 2px;
  bottom: 2px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

@keyframes styles-module__mcpPulse___uNggr {
  0% {
    box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.5);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(52, 199, 89, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(52, 199, 89, 0);
  }
}
@keyframes styles-module__mcpPulseError___fov9B {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 59, 48, 0.5);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(255, 59, 48, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 59, 48, 0);
  }
}
.styles-module__mcpStatusDot___ibgkc {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.styles-module__mcpStatusDot___ibgkc.styles-module__connecting___uo-CW {
  background: #f5a623;
  animation: styles-module__mcpPulse___uNggr 1.5s infinite;
}
.styles-module__mcpStatusDot___ibgkc.styles-module__connected___7c28g {
  background: #34c759;
  animation: styles-module__mcpPulse___uNggr 2.5s ease-in-out infinite;
}
.styles-module__mcpStatusDot___ibgkc.styles-module__disconnected___cHPxR {
  background: #ff3b30;
  animation: styles-module__mcpPulseError___fov9B 2s infinite;
}

.styles-module__helpIcon___xQg56 {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: help;
  margin-left: 0;
}
.styles-module__helpIcon___xQg56 svg {
  display: block;
  transform: translateY(1px);
  color: rgba(255, 255, 255, 0.2);
  transition: color 0.15s ease;
}
.styles-module__helpIcon___xQg56:hover svg {
  color: rgba(255, 255, 255, 0.5);
}
.styles-module__helpIcon___xQg56.styles-module__helpIconNudgeDown___0cqpM svg {
  transform: translateY(1px);
}
.styles-module__helpIcon___xQg56.styles-module__helpIconNoNudge___abogC svg {
  transform: translateY(0.5px);
}
.styles-module__helpIcon___xQg56.styles-module__helpIconNudge1-5___DM2TQ svg {
  transform: translateY(1.5px);
}
.styles-module__helpIcon___xQg56.styles-module__helpIconNudge2___TfWgC svg {
  transform: translateY(2px);
}

.styles-module__dragSelection___kZLq2 {
  position: fixed;
  top: 0;
  left: 0;
  border: 2px solid rgba(52, 199, 89, 0.6);
  border-radius: 4px;
  background: rgba(52, 199, 89, 0.08);
  pointer-events: none;
  z-index: 99997;
  will-change: transform, width, height;
  contain: layout style;
}

.styles-module__dragCount___KM90j {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #34c759;
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 1rem;
  min-width: 1.5rem;
  text-align: center;
}

.styles-module__highlightsContainer___-0xzG {
  position: fixed;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 99996;
}

.styles-module__selectedElementHighlight___fyVlI {
  position: fixed;
  top: 0;
  left: 0;
  border: 2px solid rgba(52, 199, 89, 0.5);
  border-radius: 4px;
  background: rgba(52, 199, 89, 0.06);
  pointer-events: none;
  will-change: transform, width, height;
  contain: layout style;
}

.styles-module__light___r6n4Y.styles-module__toolbarContainer___dIhma {
  background: #fff;
  color: rgba(0, 0, 0, 0.85);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04);
}
.styles-module__light___r6n4Y.styles-module__toolbarContainer___dIhma.styles-module__collapsed___Rydsn:hover {
  background: #f5f5f5;
}
.styles-module__light___r6n4Y.styles-module__controlButton___8Q0jc {
  color: rgba(0, 0, 0, 0.5);
}
.styles-module__light___r6n4Y.styles-module__controlButton___8Q0jc:hover:not(:disabled):not([data-active=true]):not([data-failed=true]):not([data-auto-sync=true]):not([data-error=true]):not([data-no-hover=true]) {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.85);
}
.styles-module__light___r6n4Y.styles-module__controlButton___8Q0jc[data-active=true] {
  color: #3c82f7;
  background: rgba(60, 130, 247, 0.15);
}
.styles-module__light___r6n4Y.styles-module__controlButton___8Q0jc[data-error=true] {
  color: #ff3b30;
  background: rgba(255, 59, 48, 0.15);
}
.styles-module__light___r6n4Y.styles-module__controlButton___8Q0jc[data-danger]:hover:not(:disabled):not([data-active=true]):not([data-failed=true]) {
  background: rgba(255, 59, 48, 0.15);
  color: #ff3b30;
}
.styles-module__light___r6n4Y.styles-module__controlButton___8Q0jc[data-auto-sync=true] {
  color: #34c759;
  background: transparent;
}
.styles-module__light___r6n4Y.styles-module__controlButton___8Q0jc[data-failed=true] {
  color: #ff3b30;
  background: rgba(255, 59, 48, 0.15);
}
.styles-module__light___r6n4Y.styles-module__buttonTooltip___Burd9 {
  background: #fff;
  color: rgba(0, 0, 0, 0.85);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04);
}
.styles-module__light___r6n4Y.styles-module__buttonTooltip___Burd9::after {
  background: #fff;
}
.styles-module__light___r6n4Y.styles-module__divider___c--s1 {
  background: rgba(0, 0, 0, 0.1);
}
.styles-module__light___r6n4Y.styles-module__markerTooltip___aLJID {
  background: #fff;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06);
}
.styles-module__light___r6n4Y.styles-module__markerTooltip___aLJID .styles-module__markerQuote___FHmrz {
  color: rgba(0, 0, 0, 0.5);
}
.styles-module__light___r6n4Y.styles-module__markerTooltip___aLJID .styles-module__markerNote___QkrrS {
  color: rgba(0, 0, 0, 0.85);
}
.styles-module__light___r6n4Y.styles-module__markerTooltip___aLJID .styles-module__markerHint___2iF-6 {
  color: rgba(0, 0, 0, 0.35);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y {
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y::before {
  background: linear-gradient(to right, #fff 0%, transparent 100%);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y::after {
  background: linear-gradient(to left, #fff 0%, transparent 100%);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__settingsHeader___pwDY9 {
  border-bottom-color: rgba(0, 0, 0, 0.08);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__settingsBrand___0gJeM {
  color: rgba(0, 0, 0, 0.85);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__settingsBrandSlash___uTG18 {
  color: rgba(0, 0, 0, 0.4);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__settingsVersion___TUcFq {
  color: rgba(0, 0, 0, 0.4);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__settingsSection___m-YM2 {
  border-top-color: rgba(0, 0, 0, 0.08);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__settingsLabel___8UjfX {
  color: rgba(0, 0, 0, 0.5);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__cycleButton___FMKfw {
  color: rgba(0, 0, 0, 0.85);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__cycleDot___nPgLY {
  background: rgba(0, 0, 0, 0.2);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__cycleDot___nPgLY.styles-module__active___-zoN6 {
  background: rgba(0, 0, 0, 0.7);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__dropdownButton___16NPz {
  color: rgba(0, 0, 0, 0.85);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__dropdownButton___16NPz:hover {
  background: rgba(0, 0, 0, 0.05);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__toggleLabel___Xm8Aa {
  color: rgba(0, 0, 0, 0.5);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__customCheckbox___U39ax {
  border: 1px solid rgba(0, 0, 0, 0.15);
  background: #fff;
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__customCheckbox___U39ax.styles-module__checked___mnZLo {
  border-color: #1a1a1a;
  background: #1a1a1a;
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__customCheckbox___U39ax.styles-module__checked___mnZLo svg {
  color: #fff;
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__sliderLabel___U8sPr {
  color: rgba(0, 0, 0, 0.4);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__sliderLabel___U8sPr:hover {
  color: rgba(0, 0, 0, 0.7);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__sliderLabel___U8sPr.styles-module__active___-zoN6 {
  color: rgba(0, 0, 0, 0.9);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__slider___GLdxp {
  background: rgba(0, 0, 0, 0.1);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__slider___GLdxp::-webkit-slider-thumb {
  background: #1a1a1a;
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__slider___GLdxp::-moz-range-thumb {
  background: #1a1a1a;
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__helpIcon___xQg56 svg {
  color: rgba(0, 0, 0, 0.2);
}
.styles-module__light___r6n4Y.styles-module__settingsPanel___OxX3Y .styles-module__helpIcon___xQg56:hover svg {
  color: rgba(0, 0, 0, 0.5);
}

.styles-module__themeToggle___2rUjA {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: 0.5rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.styles-module__themeToggle___2rUjA:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}
.styles-module__light___r6n4Y .styles-module__themeToggle___2rUjA {
  color: rgba(0, 0, 0, 0.4);
}
.styles-module__light___r6n4Y .styles-module__themeToggle___2rUjA:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.7);
}

.styles-module__themeIconWrapper___LsJIM {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 20px;
  height: 20px;
}

.styles-module__themeIcon___lCCmo {
  display: flex;
  align-items: center;
  justify-content: center;
  animation: styles-module__themeIconIn___TU6ML 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes styles-module__themeIconIn___TU6ML {
  0% {
    opacity: 0;
    transform: scale(0.8) rotate(-30deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}`,G2={toolbar:"styles-module__toolbar___wNsdK",toolbarContainer:"styles-module__toolbarContainer___dIhma",dragging:"styles-module__dragging___xrolZ",entrance:"styles-module__entrance___sgHd8",toolbarEnter:"styles-module__toolbarEnter___u8RRu",collapsed:"styles-module__collapsed___Rydsn",expanded:"styles-module__expanded___ofKPx",serverConnected:"styles-module__serverConnected___Gfbou",toggleContent:"styles-module__toggleContent___0yfyP",visible:"styles-module__visible___KHwEW",hidden:"styles-module__hidden___Ae8H4",controlsContent:"styles-module__controlsContent___9GJWU",badge:"styles-module__badge___2XsgF",fadeOut:"styles-module__fadeOut___6Ut6-",badgeEnter:"styles-module__badgeEnter___mVQLj",controlButton:"styles-module__controlButton___8Q0jc",statusShowing:"styles-module__statusShowing___te6iu",buttonBadge:"styles-module__buttonBadge___NeFWb",light:"styles-module__light___r6n4Y",mcpIndicator:"styles-module__mcpIndicator___zGJeL",connected:"styles-module__connected___7c28g",mcpIndicatorPulseConnected:"styles-module__mcpIndicatorPulseConnected___EDodZ",connecting:"styles-module__connecting___uo-CW",mcpIndicatorPulseConnecting:"styles-module__mcpIndicatorPulseConnecting___cCYte",connectionIndicatorWrapper:"styles-module__connectionIndicatorWrapper___L-e-3",connectionIndicator:"styles-module__connectionIndicator___afk9p",connectionIndicatorVisible:"styles-module__connectionIndicatorVisible___C-i5B",connectionIndicatorConnected:"styles-module__connectionIndicatorConnected___IY8pR",connectionPulse:"styles-module__connectionPulse___-Zycw",connectionIndicatorDisconnected:"styles-module__connectionIndicatorDisconnected___kmpaZ",connectionIndicatorConnecting:"styles-module__connectionIndicatorConnecting___QmSLH",buttonWrapper:"styles-module__buttonWrapper___rBcdv",buttonTooltip:"styles-module__buttonTooltip___Burd9",sendButtonWrapper:"styles-module__sendButtonWrapper___UUxG6",sendButtonVisible:"styles-module__sendButtonVisible___WPSQU",shortcut:"styles-module__shortcut___lEAQk",tooltipBelow:"styles-module__tooltipBelow___m6ats",tooltipsHidden:"styles-module__tooltipsHidden___VtLJG",tooltipVisible:"styles-module__tooltipVisible___0jcCv",buttonWrapperAlignLeft:"styles-module__buttonWrapperAlignLeft___myzIp",buttonWrapperAlignRight:"styles-module__buttonWrapperAlignRight___HCQFR",divider:"styles-module__divider___c--s1",overlay:"styles-module__overlay___Q1O9y",hoverHighlight:"styles-module__hoverHighlight___ogakW",enter:"styles-module__enter___WFIki",hoverHighlightIn:"styles-module__hoverHighlightIn___6WYHY",multiSelectOutline:"styles-module__multiSelectOutline___cSJ-m",fadeIn:"styles-module__fadeIn___b9qmf",exit:"styles-module__exit___fyOJ0",singleSelectOutline:"styles-module__singleSelectOutline___QhX-O",hoverTooltip:"styles-module__hoverTooltip___bvLk7",hoverTooltipIn:"styles-module__hoverTooltipIn___FYGQx",hoverReactPath:"styles-module__hoverReactPath___gx1IJ",hoverElementName:"styles-module__hoverElementName___QMLMl",markersLayer:"styles-module__markersLayer___-25j1",fixedMarkersLayer:"styles-module__fixedMarkersLayer___ffyX6",marker:"styles-module__marker___6sQrs",clearing:"styles-module__clearing___FQ--7",markerIn:"styles-module__markerIn___5FaAP",markerOut:"styles-module__markerOut___GU5jX",pending:"styles-module__pending___2IHLC",fixed:"styles-module__fixed___dBMHC",multiSelect:"styles-module__multiSelect___YWiuz",hovered:"styles-module__hovered___ZgXIy",renumber:"styles-module__renumber___nCTxD",renumberRoll:"styles-module__renumberRoll___Wgbq3",markerTooltip:"styles-module__markerTooltip___aLJID",tooltipIn:"styles-module__tooltipIn___0N31w",markerQuote:"styles-module__markerQuote___FHmrz",markerNote:"styles-module__markerNote___QkrrS",markerHint:"styles-module__markerHint___2iF-6",settingsPanel:"styles-module__settingsPanel___OxX3Y",settingsHeader:"styles-module__settingsHeader___pwDY9",settingsBrand:"styles-module__settingsBrand___0gJeM",settingsBrandSlash:"styles-module__settingsBrandSlash___uTG18",settingsVersion:"styles-module__settingsVersion___TUcFq",settingsSection:"styles-module__settingsSection___m-YM2",settingsLabel:"styles-module__settingsLabel___8UjfX",cycleButton:"styles-module__cycleButton___FMKfw",cycleDot:"styles-module__cycleDot___nPgLY",dropdownButton:"styles-module__dropdownButton___16NPz",toggleLabel:"styles-module__toggleLabel___Xm8Aa",customCheckbox:"styles-module__customCheckbox___U39ax",sliderLabel:"styles-module__sliderLabel___U8sPr",slider:"styles-module__slider___GLdxp",helpIcon:"styles-module__helpIcon___xQg56",themeToggle:"styles-module__themeToggle___2rUjA",dark:"styles-module__dark___ILIQf",settingsOption:"styles-module__settingsOption___UNa12",selected:"styles-module__selected___OwRqP",settingsPanelContainer:"styles-module__settingsPanelContainer___Xksv8",transitioning:"styles-module__transitioning___qxzCk",settingsPage:"styles-module__settingsPage___6YfHH",slideLeft:"styles-module__slideLeft___Ps01J",automationsPage:"styles-module__automationsPage___uvCq6",slideIn:"styles-module__slideIn___4-qXe",settingsNavLink:"styles-module__settingsNavLink___wCzJt",settingsNavLinkRight:"styles-module__settingsNavLinkRight___ZWwhj",mcpNavIndicator:"styles-module__mcpNavIndicator___cl9pO",mcpPulse:"styles-module__mcpPulse___uNggr",settingsBackButton:"styles-module__settingsBackButton___bIe2j",automationHeader:"styles-module__automationHeader___InP0r",automationDescription:"styles-module__automationDescription___NKlmo",learnMoreLink:"styles-module__learnMoreLink___8xv-x",autoSendRow:"styles-module__autoSendRow___UblX5",autoSendLabel:"styles-module__autoSendLabel___icDc2",active:"styles-module__active___-zoN6",webhookUrlInput:"styles-module__webhookUrlInput___2375C",settingsSectionExtraPadding:"styles-module__settingsSectionExtraPadding___jdhFV",settingsSectionGrow:"styles-module__settingsSectionGrow___h-5HZ",settingsRow:"styles-module__settingsRow___3sdhc",settingsRowMarginTop:"styles-module__settingsRowMarginTop___zA0Sp",dropdownContainer:"styles-module__dropdownContainer___BVnxe",settingsRowDisabled:"styles-module__settingsRowDisabled___EgS0V",toggleSwitch:"styles-module__toggleSwitch___l4Ygm",cycleButtonText:"styles-module__cycleButtonText___fD1LR",cycleTextIn:"styles-module__cycleTextIn___Q6zJf",cycleDots:"styles-module__cycleDots___LWuoQ",dropdownMenu:"styles-module__dropdownMenu___k73ER",scaleIn:"styles-module__scaleIn___c-r1K",dropdownItem:"styles-module__dropdownItem___ylsLj",settingsLabelMarker:"styles-module__settingsLabelMarker___ewdtV",settingsOptions:"styles-module__settingsOptions___LyrBA",sliderContainer:"styles-module__sliderContainer___ducXj",sliderLabels:"styles-module__sliderLabels___FhLDB",colorOptions:"styles-module__colorOptions___iHCNX",colorOption:"styles-module__colorOption___IodiY",colorOptionRing:"styles-module__colorOptionRing___U2xpo",settingsToggle:"styles-module__settingsToggle___fBrFn",settingsToggleMarginBottom:"styles-module__settingsToggleMarginBottom___MZUyF",checked:"styles-module__checked___mnZLo",toggleSlider:"styles-module__toggleSlider___wprIn",disabled:"styles-module__disabled___332Jw",mcpStatusDot:"styles-module__mcpStatusDot___ibgkc",disconnected:"styles-module__disconnected___cHPxR",mcpPulseError:"styles-module__mcpPulseError___fov9B",helpIconNudgeDown:"styles-module__helpIconNudgeDown___0cqpM",helpIconNoNudge:"styles-module__helpIconNoNudge___abogC","helpIconNudge1-5":"styles-module__helpIconNudge1-5___DM2TQ",helpIconNudge2:"styles-module__helpIconNudge2___TfWgC",dragSelection:"styles-module__dragSelection___kZLq2",dragCount:"styles-module__dragCount___KM90j",highlightsContainer:"styles-module__highlightsContainer___-0xzG",selectedElementHighlight:"styles-module__selectedElementHighlight___fyVlI",themeIconWrapper:"styles-module__themeIconWrapper___LsJIM",themeIcon:"styles-module__themeIcon___lCCmo",themeIconIn:"styles-module__themeIconIn___TU6ML",scaleOut:"styles-module__scaleOut___Wctwz",slideUp:"styles-module__slideUp___kgD36",slideDown:"styles-module__slideDown___zcdje",settingsPanelIn:"styles-module__settingsPanelIn___MGfO8",settingsPanelOut:"styles-module__settingsPanelOut___Zfymi"};if(typeof document<"u"){let t=document.getElementById("feedback-tool-styles-page-toolbar-css-styles");t||(t=document.createElement("style"),t.id="feedback-tool-styles-page-toolbar-css-styles",t.textContent=Z2,document.head.appendChild(t))}var r=G2;function zu(t,e="filtered"){let{name:n,path:l}=Ei(t);if(e==="off")return{name:n,elementName:n,path:l,reactComponents:null};let a=q2(t,{mode:e});return{name:a.path?`${a.path} ${n}`:n,elementName:n,path:l,reactComponents:a.path}}var E_=!1,T_={outputDetail:"standard",autoClearAfterCopy:!1,annotationColor:"#3c82f7",blockInteractions:!0,reactEnabled:!0,markerClickBehavior:"edit",webhookUrl:"",webhooksEnabled:!0},Ie=t=>{if(!t||!t.trim())return!1;try{let e=new URL(t.trim());return e.protocol==="http:"||e.protocol==="https:"}catch{return!1}},$2={compact:"off",standard:"filtered",detailed:"smart",forensic:"all"},no=[{value:"compact",label:"Compact"},{value:"standard",label:"Standard"},{value:"detailed",label:"Detailed"},{value:"forensic",label:"Forensic"}],V2=[{value:"#AF52DE",label:"Purple"},{value:"#3c82f7",label:"Blue"},{value:"#5AC8FA",label:"Cyan"},{value:"#34C759",label:"Green"},{value:"#FFD60A",label:"Yellow"},{value:"#FF9500",label:"Orange"},{value:"#FF3B30",label:"Red"}];function Kl(t,e){let n=document.elementFromPoint(t,e);if(!n)return null;for(;n?.shadowRoot;){let l=n.shadowRoot.elementFromPoint(t,e);if(!l||l===n)break;n=l}return n}function Lu(t){let e=t;for(;e&&e!==document.body;){let l=window.getComputedStyle(e).position;if(l==="fixed"||l==="sticky")return!0;e=e.parentElement}return!1}function A_(t,e,n="standard",l="filtered"){if(t.length===0)return"";let a=typeof window<"u"?`${window.innerWidth}\xD7${window.innerHeight}`:"unknown",o=`## Page Feedback: ${e}
`;return n==="forensic"?(o+=`
**Environment:**
`,o+=`- Viewport: ${a}
`,typeof window<"u"&&(o+=`- URL: ${window.location.href}
`,o+=`- User Agent: ${navigator.userAgent}
`,o+=`- Timestamp: ${new Date().toISOString()}
`,o+=`- Device Pixel Ratio: ${window.devicePixelRatio}
`),o+=`
---
`):n!=="compact"&&(o+=`**Viewport:** ${a}
`),o+=`
`,t.forEach((i,s)=>{n==="compact"?(o+=`${s+1}. **${i.element}**: ${i.comment}`,i.selectedText&&(o+=` (re: "${i.selectedText.slice(0,30)}${i.selectedText.length>30?"...":""}")`),o+=`
`):n==="forensic"?(o+=`### ${s+1}. ${i.element}
`,i.isMultiSelect&&i.fullPath&&(o+=`*Forensic data shown for first element of selection*
`),i.fullPath&&(o+=`**Full DOM Path:** ${i.fullPath}
`),i.cssClasses&&(o+=`**CSS Classes:** ${i.cssClasses}
`),i.boundingBox&&(o+=`**Position:** x:${Math.round(i.boundingBox.x)}, y:${Math.round(i.boundingBox.y)} (${Math.round(i.boundingBox.width)}\xD7${Math.round(i.boundingBox.height)}px)
`),o+=`**Annotation at:** ${i.x.toFixed(1)}% from left, ${Math.round(i.y)}px from top
`,i.selectedText&&(o+=`**Selected text:** "${i.selectedText}"
`),i.nearbyText&&!i.selectedText&&(o+=`**Context:** ${i.nearbyText.slice(0,100)}
`),i.computedStyles&&(o+=`**Computed Styles:** ${i.computedStyles}
`),i.accessibility&&(o+=`**Accessibility:** ${i.accessibility}
`),i.nearbyElements&&(o+=`**Nearby Elements:** ${i.nearbyElements}
`),i.reactComponents&&(o+=`**React:** ${i.reactComponents}
`),o+=`**Feedback:** ${i.comment}

`):(o+=`### ${s+1}. ${i.element}
`,o+=`**Location:** ${i.elementPath}
`,i.reactComponents&&(o+=`**React:** ${i.reactComponents}
`),n==="detailed"&&(i.cssClasses&&(o+=`**Classes:** ${i.cssClasses}
`),i.boundingBox&&(o+=`**Position:** ${Math.round(i.boundingBox.x)}px, ${Math.round(i.boundingBox.y)}px (${Math.round(i.boundingBox.width)}\xD7${Math.round(i.boundingBox.height)}px)
`)),i.selectedText&&(o+=`**Selected text:** "${i.selectedText}"
`),n==="detailed"&&i.nearbyText&&!i.selectedText&&(o+=`**Context:** ${i.nearbyText.slice(0,100)}
`),o+=`**Feedback:** ${i.comment}

`)}),o.trim()}function N_({demoAnnotations:t,demoDelay:e=1e3,enableDemoMode:n=!1,onAnnotationAdd:l,onAnnotationDelete:a,onAnnotationUpdate:o,onAnnotationsClear:i,onCopy:s,onSubmit:u,copyToClipboard:m=!0,endpoint:h,sessionId:v,onSessionCreated:g,webhookUrl:b}={}){let[T,O]=(0,E.useState)(!1),[L,f]=(0,E.useState)([]),[_,p]=(0,E.useState)(!0),[C,B]=(0,E.useState)(!1),[X,N]=(0,E.useState)(!1),[H,G]=(0,E.useState)(null),[I,ke]=(0,E.useState)({x:0,y:0}),[D,le]=(0,E.useState)(null),[Bl,Yl]=(0,E.useState)(!1),[he,ja]=(0,E.useState)("idle"),[yd,jt]=(0,E.useState)(!1),[Hl,$e]=(0,E.useState)(!1),[oi,eu]=(0,E.useState)(null),[nu,cl]=(0,E.useState)(null),[gd,Xa]=(0,E.useState)([]),[pd,bd]=(0,E.useState)(null),[ii,vd]=(0,E.useState)(null),[P,Qa]=(0,E.useState)(null),[lu,sn]=(0,E.useState)(null),[xd,rl]=(0,E.useState)([]),[dl,Cd]=(0,E.useState)(0),[Sd,wd]=(0,E.useState)(!1),[Ot,d5]=(0,E.useState)(!1),[Qe,Ed]=(0,E.useState)(!1),[qa,Td]=(0,E.useState)(!1),[_5,Ad]=(0,E.useState)(!1),[au,ou]=(0,E.useState)("main"),[kd,Md]=(0,E.useState)(!1),[f5,iu]=(0,E.useState)(!1),[Dt,Rl]=(0,E.useState)([]),Ve=(0,E.useRef)({cmd:!1,shift:!1}),ae=()=>{iu(!0)},m5=()=>{iu(!1)},Za=({content:c,children:d})=>{let[S,A]=(0,E.useState)(!1),[x,M]=(0,E.useState)(!1),[Y,U]=(0,E.useState)(!1),[J,$]=(0,E.useState)({top:0,right:0}),j=(0,E.useRef)(null),q=(0,E.useRef)(null),V=(0,E.useRef)(null),Z=()=>{if(j.current){let kt=j.current.getBoundingClientRect();$({top:kt.top+kt.height/2,right:window.innerWidth-kt.left+8})}},R=()=>{A(!0),U(!0),V.current&&(clearTimeout(V.current),V.current=null),Z(),q.current=st(()=>{M(!0)},500)},Me=()=>{A(!1),q.current&&(clearTimeout(q.current),q.current=null),M(!1),V.current=st(()=>{U(!1)},150)};return(0,E.useEffect)(()=>()=>{q.current&&clearTimeout(q.current),V.current&&clearTimeout(V.current)},[]),(0,y.jsxs)(y.Fragment,{children:[(0,y.jsx)("span",{ref:j,onMouseEnter:R,onMouseLeave:Me,children:d}),Y&&(0,Nu.createPortal)((0,y.jsx)("div",{"data-feedback-toolbar":!0,style:{position:"fixed",top:J.top,right:J.right,transform:"translateY(-50%)",padding:"6px 10px",background:"#383838",color:"rgba(255, 255, 255, 0.7)",fontSize:"11px",fontWeight:400,lineHeight:"14px",borderRadius:"10px",width:"180px",textAlign:"left",zIndex:100020,pointerEvents:"none",boxShadow:"0px 1px 8px rgba(0, 0, 0, 0.28)",opacity:x&&!kd?1:0,transition:"opacity 0.15s ease"},children:c}),document.body)]})},[z,Nn]=(0,E.useState)(T_),[F,zd]=(0,E.useState)(!0),[Ld,Nd]=(0,E.useState)(!1),Ul=typeof window<"u"&&(window.location.hostname==="localhost"||window.location.hostname==="127.0.0.1"||window.location.hostname==="0.0.0.0"||window.location.hostname.endsWith(".local")),un=Ul&&z.reactEnabled?$2[z.outputDetail]:"off",[ye,su]=(0,E.useState)(v??null),Od=(0,E.useRef)(!1),[Pt,_l]=(0,E.useState)(h?"connecting":"disconnected"),[Tt,uu]=(0,E.useState)(null),[cn,Dd]=(0,E.useState)(!1),[jl,Bd]=(0,E.useState)(null),[h5,y5]=(0,E.useState)(0),cu=(0,E.useRef)(!1),[Yd,Ga]=(0,E.useState)(new Set),[Hd,si]=(0,E.useState)(new Set),[$a,ui]=(0,E.useState)(!1),[g5,Xl]=(0,E.useState)(!1),[rn,Rd]=(0,E.useState)(!1),Ql=(0,E.useRef)(null),Ke=(0,E.useRef)(null),Va=(0,E.useRef)(null),Ka=(0,E.useRef)(null),ci=(0,E.useRef)(!1),Ud=(0,E.useRef)(0),ri=(0,E.useRef)(null),jd=(0,E.useRef)(null),ru=8,p5=50,Xd=(0,E.useRef)(null),Qd=(0,E.useRef)(null),Ja=(0,E.useRef)(null),ht=typeof window<"u"?window.location.pathname:"/";(0,E.useEffect)(()=>{if(qa)Ad(!0);else{iu(!1),ou("main");let c=st(()=>Ad(!1),0);return()=>clearTimeout(c)}},[qa]),(0,E.useEffect)(()=>{Md(!0);let c=st(()=>Md(!1),350);return()=>clearTimeout(c)},[au]);let qd=T&&_;(0,E.useEffect)(()=>{if(qd){N(!1),B(!0),Ga(new Set);let c=st(()=>{Ga(d=>{let S=new Set(d);return L.forEach(A=>S.add(A.id)),S})},350);return()=>clearTimeout(c)}else if(C){N(!0);let c=st(()=>{B(!1),N(!1)},250);return()=>clearTimeout(c)}},[qd]),(0,E.useEffect)(()=>{d5(!0),Cd(window.scrollY);let c=Tu(ht);f(c),E_||(Nd(!0),E_=!0,st(()=>Nd(!1),750));try{let d=localStorage.getItem("feedback-toolbar-settings");d&&Nn({...T_,...JSON.parse(d)})}catch{}try{let d=localStorage.getItem("feedback-toolbar-theme");d!==null&&zd(d==="dark")}catch{}try{let d=localStorage.getItem("feedback-toolbar-position");if(d){let S=JSON.parse(d);typeof S.x=="number"&&typeof S.y=="number"&&uu(S)}}catch{}},[ht]),(0,E.useEffect)(()=>{Ot&&localStorage.setItem("feedback-toolbar-settings",JSON.stringify(z))},[z,Ot]),(0,E.useEffect)(()=>{Ot&&localStorage.setItem("feedback-toolbar-theme",F?"dark":"light")},[F,Ot]);let Zd=(0,E.useRef)(!1);(0,E.useEffect)(()=>{let c=Zd.current;Zd.current=cn,c&&!cn&&Tt&&Ot&&localStorage.setItem("feedback-toolbar-position",JSON.stringify(Tt))},[cn,Tt,Ot]),(0,E.useEffect)(()=>{if(!h||!Ot||Od.current)return;Od.current=!0,_l("connecting"),(async()=>{try{let d=k2(ht),S=v||d,A=!1;if(S)try{let x=await x_(h,S);su(x.id),_l("connected"),Au(ht,x.id),A=!0;let M=Tu(ht),Y=new Set(x.annotations.map(J=>J.id)),U=M.filter(J=>!Y.has(J.id));if(U.length>0){let $=`${typeof window<"u"?window.location.origin:""}${ht}`,q=(await Promise.allSettled(U.map(Z=>wi(h,x.id,{...Z,sessionId:x.id,url:$})))).map((Z,R)=>Z.status==="fulfilled"?Z.value:(console.warn("[Agentation] Failed to sync annotation:",Z.reason),U[R])),V=[...x.annotations,...q];f(V),to(ht,V,x.id)}else f(x.annotations),to(ht,x.annotations,x.id)}catch(x){console.warn("[Agentation] Could not join session, creating new:",x),M2(ht)}if(!A){let x=typeof window<"u"?window.location.href:"/",M=await ku(h,x);su(M.id),_l("connected"),Au(ht,M.id),g?.(M.id);let Y=T2(),U=typeof window<"u"?window.location.origin:"",J=[];for(let[$,j]of Y){let q=j.filter(R=>!R._syncedTo);if(q.length===0)continue;let V=`${U}${$}`,Z=$===ht;J.push((async()=>{try{let R=Z?M:await ku(h,V),kt=(await Promise.allSettled(q.map(ge=>wi(h,R.id,{...ge,sessionId:R.id,url:V})))).map((ge,oe)=>ge.status==="fulfilled"?ge.value:(console.warn("[Agentation] Failed to sync annotation:",ge.reason),q[oe]));if(to($,kt,R.id),Z){let ge=new Set(q.map(oe=>oe.id));f(oe=>{let ze=oe.filter(ot=>!ge.has(ot.id));return[...kt,...ze]})}}catch(R){console.warn(`[Agentation] Failed to sync annotations for ${$}:`,R)}})())}await Promise.allSettled(J)}}catch(d){_l("disconnected"),console.warn("[Agentation] Failed to initialize session, using local storage:",d)}})()},[h,v,Ot,g,ht]),(0,E.useEffect)(()=>{if(!h||!Ot)return;let c=async()=>{try{(await fetch(`${h}/health`)).ok?_l("connected"):_l("disconnected")}catch{_l("disconnected")}};c();let d=y2(c,1e4);return()=>clearInterval(d)},[h,Ot]),(0,E.useEffect)(()=>{if(!h||!Ot||!ye)return;let c=new EventSource(`${h}/sessions/${ye}/events`),d=["resolved","dismissed"],S=A=>{try{let x=JSON.parse(A.data);if(d.includes(x.payload?.status)){let M=x.payload.id;si(Y=>new Set(Y).add(M)),st(()=>{f(Y=>Y.filter(U=>U.id!==M)),si(Y=>{let U=new Set(Y);return U.delete(M),U})},150)}}catch{}};return c.addEventListener("annotation.updated",S),()=>{c.removeEventListener("annotation.updated",S),c.close()}},[h,Ot,ye]),(0,E.useEffect)(()=>{if(!h||!Ot)return;let c=jd.current==="disconnected",d=Pt==="connected";jd.current=Pt,c&&d&&(async()=>{try{let A=Tu(ht);if(A.length===0)return;let M=`${typeof window<"u"?window.location.origin:""}${ht}`,Y=ye,U=[];if(Y)try{U=(await x_(h,Y)).annotations}catch{Y=null}Y||(Y=(await ku(h,M)).id,su(Y),Au(ht,Y));let J=new Set(U.map(j=>j.id)),$=A.filter(j=>!J.has(j.id));if($.length>0){let q=(await Promise.allSettled($.map(Z=>wi(h,Y,{...Z,sessionId:Y,url:M})))).map((Z,R)=>Z.status==="fulfilled"?Z.value:(console.warn("[Agentation] Failed to sync annotation on reconnect:",Z.reason),$[R])),V=[...U,...q];f(V),to(ht,V,Y)}}catch(A){console.warn("[Agentation] Failed to sync on reconnect:",A)}})()},[Pt,h,Ot,ye,ht]),(0,E.useEffect)(()=>{if(!n||!Ot||!t||t.length===0||L.length>0)return;let c=[];return c.push(st(()=>{O(!0)},e-200)),t.forEach((d,S)=>{let A=e+S*300;c.push(st(()=>{let x=document.querySelector(d.selector);if(!x)return;let M=x.getBoundingClientRect(),{name:Y,path:U}=Ei(x),J={id:`demo-${Date.now()}-${S}`,x:(M.left+M.width/2)/window.innerWidth*100,y:M.top+M.height/2+window.scrollY,comment:d.comment,element:Y,elementPath:U,timestamp:Date.now(),selectedText:d.selectedText,boundingBox:{x:M.left,y:M.top+window.scrollY,width:M.width,height:M.height},nearbyText:Fa(x),cssClasses:Pa(x)};f($=>[...$,J])},A))}),()=>{c.forEach(clearTimeout)}},[n,Ot,t,e]),(0,E.useEffect)(()=>{let c=()=>{Cd(window.scrollY),wd(!0),Ja.current&&clearTimeout(Ja.current),Ja.current=st(()=>{wd(!1)},150)};return window.addEventListener("scroll",c,{passive:!0}),()=>{window.removeEventListener("scroll",c),Ja.current&&clearTimeout(Ja.current)}},[]),(0,E.useEffect)(()=>{Ot&&L.length>0?ye?to(ht,L,ye):L_(ht,L):Ot&&L.length===0&&localStorage.removeItem(Ti(ht))},[L,ht,Ot,ye]);let Gd=(0,E.useCallback)(()=>{Qe||(p2(),Ed(!0))},[Qe]),di=(0,E.useCallback)(()=>{Qe&&(b_(),Ed(!1))},[Qe]),du=(0,E.useCallback)(()=>{Qe?di():Gd()},[Qe,Gd,di]),$d=(0,E.useCallback)(()=>{if(Dt.length===0)return;let c=Dt[0],d=c.element,S=Dt.length>1,A=Dt.map(x=>x.element.getBoundingClientRect());if(S){let x={left:Math.min(...A.map(R=>R.left)),top:Math.min(...A.map(R=>R.top)),right:Math.max(...A.map(R=>R.right)),bottom:Math.max(...A.map(R=>R.bottom))},M=Dt.slice(0,5).map(R=>R.name).join(", "),Y=Dt.length>5?` +${Dt.length-5} more`:"",U=A.map(R=>({x:R.left,y:R.top+window.scrollY,width:R.width,height:R.height})),$=Dt[Dt.length-1].element,j=A[A.length-1],q=j.left+j.width/2,V=j.top+j.height/2,Z=Lu($);le({x:q/window.innerWidth*100,y:Z?V:V+window.scrollY,clientY:V,element:`${Dt.length} elements: ${M}${Y}`,elementPath:"multi-select",boundingBox:{x:x.left,y:x.top+window.scrollY,width:x.right-x.left,height:x.bottom-x.top},isMultiSelect:!0,isFixed:Z,elementBoundingBoxes:U,multiSelectElements:Dt.map(R=>R.element),targetElement:$,fullPath:Si(d),accessibility:Ci(d),computedStyles:xi(d),computedStylesObj:vi(d),nearbyElements:bi(d),cssClasses:Pa(d),nearbyText:Fa(d)})}else{let x=A[0],M=Lu(d);le({x:x.left/window.innerWidth*100,y:M?x.top:x.top+window.scrollY,clientY:x.top,element:c.name,elementPath:c.path,boundingBox:{x:x.left,y:M?x.top:x.top+window.scrollY,width:x.width,height:x.height},isFixed:M,fullPath:Si(d),accessibility:Ci(d),computedStyles:xi(d),computedStylesObj:vi(d),nearbyElements:bi(d),cssClasses:Pa(d),nearbyText:Fa(d),reactComponents:c.reactComponents})}Rl([]),G(null)},[Dt]);(0,E.useEffect)(()=>{T||(le(null),Qa(null),sn(null),rl([]),G(null),Td(!1),Rl([]),Ve.current={cmd:!1,shift:!1},Qe&&di())},[T,Qe,di]),(0,E.useEffect)(()=>()=>{b_()},[]),(0,E.useEffect)(()=>{if(!T)return;let c=document.createElement("style");return c.id="feedback-cursor-styles",c.textContent=`
      body * {
        cursor: crosshair !important;
      }
      body p, body span, body h1, body h2, body h3, body h4, body h5, body h6,
      body li, body td, body th, body label, body blockquote, body figcaption,
      body caption, body legend, body dt, body dd, body pre, body code,
      body em, body strong, body b, body i, body u, body s, body a,
      body time, body address, body cite, body q, body abbr, body dfn,
      body mark, body small, body sub, body sup, body [contenteditable],
      body p *, body span *, body h1 *, body h2 *, body h3 *, body h4 *,
      body h5 *, body h6 *, body li *, body a *, body label *, body pre *,
      body code *, body blockquote *, body [contenteditable] * {
        cursor: text !important;
      }
      [data-feedback-toolbar], [data-feedback-toolbar] * {
        cursor: default !important;
      }
      [data-feedback-toolbar] textarea,
      [data-feedback-toolbar] input[type="text"],
      [data-feedback-toolbar] input[type="url"] {
        cursor: text !important;
      }
      [data-feedback-toolbar] button,
      [data-feedback-toolbar] button *,
      [data-feedback-toolbar] label,
      [data-feedback-toolbar] label *,
      [data-feedback-toolbar] a,
      [data-feedback-toolbar] a *,
      [data-feedback-toolbar] [role="button"],
      [data-feedback-toolbar] [role="button"] * {
        cursor: pointer !important;
      }
      [data-annotation-marker], [data-annotation-marker] * {
        cursor: pointer !important;
      }
    `,document.head.appendChild(c),()=>{let d=document.getElementById("feedback-cursor-styles");d&&d.remove()}},[T]),(0,E.useEffect)(()=>{if(!T||D)return;let c=d=>{let S=d.composedPath()[0]||d.target;if(ie(S,"[data-feedback-toolbar]")){G(null);return}let A=Kl(d.clientX,d.clientY);if(!A||ie(A,"[data-feedback-toolbar]")){G(null);return}let{name:x,elementName:M,path:Y,reactComponents:U}=zu(A,un),J=A.getBoundingClientRect();G({element:x,elementName:M,elementPath:Y,rect:J,reactComponents:U}),ke({x:d.clientX,y:d.clientY})};return document.addEventListener("mousemove",c),()=>document.removeEventListener("mousemove",c)},[T,D,un]),(0,E.useEffect)(()=>{if(!T)return;let c=d=>{if(ci.current){ci.current=!1;return}let S=d.composedPath()[0]||d.target;if(ie(S,"[data-feedback-toolbar]")||ie(S,"[data-annotation-popup]")||ie(S,"[data-annotation-marker]"))return;if(d.metaKey&&d.shiftKey&&!D&&!P){d.preventDefault(),d.stopPropagation();let kt=Kl(d.clientX,d.clientY);if(!kt)return;let ge=kt.getBoundingClientRect(),{name:oe,path:ze,reactComponents:ot}=zu(kt,un),lt=Dt.findIndex(qt=>qt.element===kt);lt>=0?Rl(qt=>qt.filter((Bt,On)=>On!==lt)):Rl(qt=>[...qt,{element:kt,rect:ge,name:oe,path:ze,reactComponents:ot??void 0}]);return}let A=ie(S,"button, a, input, select, textarea, [role='button'], [onclick]");if(z.blockInteractions&&A&&(d.preventDefault(),d.stopPropagation()),D){if(A&&!z.blockInteractions)return;d.preventDefault(),Xd.current?.shake();return}if(P){if(A&&!z.blockInteractions)return;d.preventDefault(),Qd.current?.shake();return}d.preventDefault();let x=Kl(d.clientX,d.clientY);if(!x)return;let{name:M,path:Y,reactComponents:U}=zu(x,un),J=x.getBoundingClientRect(),$=d.clientX/window.innerWidth*100,j=Lu(x),q=j?d.clientY:d.clientY+window.scrollY,V=window.getSelection(),Z;V&&V.toString().trim().length>0&&(Z=V.toString().trim().slice(0,500));let R=vi(x),Me=xi(x);le({x:$,y:q,clientY:d.clientY,element:M,elementPath:Y,selectedText:Z,boundingBox:{x:J.left,y:j?J.top:J.top+window.scrollY,width:J.width,height:J.height},nearbyText:Fa(x),cssClasses:Pa(x),isFixed:j,fullPath:Si(x),accessibility:Ci(x),computedStyles:Me,computedStylesObj:R,nearbyElements:bi(x),reactComponents:U??void 0,targetElement:x}),G(null)};return document.addEventListener("click",c,!0),()=>document.removeEventListener("click",c,!0)},[T,D,P,z.blockInteractions,un,Dt]),(0,E.useEffect)(()=>{if(!T)return;let c=A=>{A.key==="Meta"&&(Ve.current.cmd=!0),A.key==="Shift"&&(Ve.current.shift=!0)},d=A=>{let x=Ve.current.cmd&&Ve.current.shift;A.key==="Meta"&&(Ve.current.cmd=!1),A.key==="Shift"&&(Ve.current.shift=!1);let M=Ve.current.cmd&&Ve.current.shift;x&&!M&&Dt.length>0&&$d()},S=()=>{Ve.current={cmd:!1,shift:!1},Rl([])};return document.addEventListener("keydown",c),document.addEventListener("keyup",d),window.addEventListener("blur",S),()=>{document.removeEventListener("keydown",c),document.removeEventListener("keyup",d),window.removeEventListener("blur",S)}},[T,Dt,$d]),(0,E.useEffect)(()=>{if(!T||D)return;let c=d=>{let S=d.composedPath()[0]||d.target;ie(S,"[data-feedback-toolbar]")||ie(S,"[data-annotation-marker]")||ie(S,"[data-annotation-popup]")||new Set(["P","SPAN","H1","H2","H3","H4","H5","H6","LI","TD","TH","LABEL","BLOCKQUOTE","FIGCAPTION","CAPTION","LEGEND","DT","DD","PRE","CODE","EM","STRONG","B","I","U","S","A","TIME","ADDRESS","CITE","Q","ABBR","DFN","MARK","SMALL","SUB","SUP"]).has(S.tagName)||S.isContentEditable||(Ql.current={x:d.clientX,y:d.clientY})};return document.addEventListener("mousedown",c),()=>document.removeEventListener("mousedown",c)},[T,D]),(0,E.useEffect)(()=>{if(!T||D)return;let c=d=>{if(!Ql.current)return;let S=d.clientX-Ql.current.x,A=d.clientY-Ql.current.y,x=S*S+A*A,M=ru*ru;if(!rn&&x>=M&&(Ke.current=Ql.current,Rd(!0)),(rn||x>=M)&&Ke.current){if(Va.current){let ot=Math.min(Ke.current.x,d.clientX),lt=Math.min(Ke.current.y,d.clientY),qt=Math.abs(d.clientX-Ke.current.x),Bt=Math.abs(d.clientY-Ke.current.y);Va.current.style.transform=`translate(${ot}px, ${lt}px)`,Va.current.style.width=`${qt}px`,Va.current.style.height=`${Bt}px`}let Y=Date.now();if(Y-Ud.current<p5)return;Ud.current=Y;let U=Ke.current.x,J=Ke.current.y,$=Math.min(U,d.clientX),j=Math.min(J,d.clientY),q=Math.max(U,d.clientX),V=Math.max(J,d.clientY),Z=($+q)/2,R=(j+V)/2,Me=new Set,kt=[[$,j],[q,j],[$,V],[q,V],[Z,R],[Z,j],[Z,V],[$,R],[q,R]];for(let[ot,lt]of kt){let qt=document.elementsFromPoint(ot,lt);for(let Bt of qt)Bt instanceof HTMLElement&&Me.add(Bt)}let ge=document.querySelectorAll("button, a, input, img, p, h1, h2, h3, h4, h5, h6, li, label, td, th, div, span, section, article, aside, nav");for(let ot of ge)if(ot instanceof HTMLElement){let lt=ot.getBoundingClientRect(),qt=lt.left+lt.width/2,Bt=lt.top+lt.height/2,On=qt>=$&&qt<=q&&Bt>=j&&Bt<=V,dn=Math.min(lt.right,q)-Math.max(lt.left,$),Jd=Math.min(lt.bottom,V)-Math.max(lt.top,j),w5=dn>0&&Jd>0?dn*Jd:0,Wd=lt.width*lt.height,E5=Wd>0?w5/Wd:0;(On||E5>.5)&&Me.add(ot)}let oe=[],ze=new Set(["BUTTON","A","INPUT","IMG","P","H1","H2","H3","H4","H5","H6","LI","LABEL","TD","TH","SECTION","ARTICLE","ASIDE","NAV"]);for(let ot of Me){if(ie(ot,"[data-feedback-toolbar]")||ie(ot,"[data-annotation-marker]"))continue;let lt=ot.getBoundingClientRect();if(!(lt.width>window.innerWidth*.8&&lt.height>window.innerHeight*.5)&&!(lt.width<10||lt.height<10)&&lt.left<q&&lt.right>$&&lt.top<V&&lt.bottom>j){let qt=ot.tagName,Bt=ze.has(qt);if(!Bt&&(qt==="DIV"||qt==="SPAN")){let On=ot.textContent&&ot.textContent.trim().length>0,dn=ot.onclick!==null||ot.getAttribute("role")==="button"||ot.getAttribute("role")==="link"||ot.classList.contains("clickable")||ot.hasAttribute("data-clickable");(On||dn)&&!ot.querySelector("p, h1, h2, h3, h4, h5, h6, button, a")&&(Bt=!0)}if(Bt){let On=!1;for(let dn of oe)if(dn.left<=lt.left&&dn.right>=lt.right&&dn.top<=lt.top&&dn.bottom>=lt.bottom){On=!0;break}On||oe.push(lt)}}}if(Ka.current){let ot=Ka.current;for(;ot.children.length>oe.length;)ot.removeChild(ot.lastChild);oe.forEach((lt,qt)=>{let Bt=ot.children[qt];Bt||(Bt=document.createElement("div"),Bt.className=r.selectedElementHighlight,ot.appendChild(Bt)),Bt.style.transform=`translate(${lt.left}px, ${lt.top}px)`,Bt.style.width=`${lt.width}px`,Bt.style.height=`${lt.height}px`})}}};return document.addEventListener("mousemove",c,{passive:!0}),()=>document.removeEventListener("mousemove",c)},[T,D,rn,ru]),(0,E.useEffect)(()=>{if(!T)return;let c=d=>{let S=rn,A=Ke.current;if(rn&&A){ci.current=!0;let x=Math.min(A.x,d.clientX),M=Math.min(A.y,d.clientY),Y=Math.max(A.x,d.clientX),U=Math.max(A.y,d.clientY),J=[];document.querySelectorAll("button, a, input, img, p, h1, h2, h3, h4, h5, h6, li, label, td, th").forEach(Z=>{if(!(Z instanceof HTMLElement)||ie(Z,"[data-feedback-toolbar]")||ie(Z,"[data-annotation-marker]"))return;let R=Z.getBoundingClientRect();R.width>window.innerWidth*.8&&R.height>window.innerHeight*.5||R.width<10||R.height<10||R.left<Y&&R.right>x&&R.top<U&&R.bottom>M&&J.push({element:Z,rect:R})});let j=J.filter(({element:Z})=>!J.some(({element:R})=>R!==Z&&Z.contains(R))),q=d.clientX/window.innerWidth*100,V=d.clientY+window.scrollY;if(j.length>0){let Z=j.reduce((ze,{rect:ot})=>({left:Math.min(ze.left,ot.left),top:Math.min(ze.top,ot.top),right:Math.max(ze.right,ot.right),bottom:Math.max(ze.bottom,ot.bottom)}),{left:1/0,top:1/0,right:-1/0,bottom:-1/0}),R=j.slice(0,5).map(({element:ze})=>Ei(ze).name).join(", "),Me=j.length>5?` +${j.length-5} more`:"",kt=j[0].element,ge=vi(kt),oe=xi(kt);le({x:q,y:V,clientY:d.clientY,element:`${j.length} elements: ${R}${Me}`,elementPath:"multi-select",boundingBox:{x:Z.left,y:Z.top+window.scrollY,width:Z.right-Z.left,height:Z.bottom-Z.top},isMultiSelect:!0,fullPath:Si(kt),accessibility:Ci(kt),computedStyles:oe,computedStylesObj:ge,nearbyElements:bi(kt),cssClasses:Pa(kt),nearbyText:Fa(kt)})}else{let Z=Math.abs(Y-x),R=Math.abs(U-M);Z>20&&R>20&&le({x:q,y:V,clientY:d.clientY,element:"Area selection",elementPath:`region at (${Math.round(x)}, ${Math.round(M)})`,boundingBox:{x,y:M+window.scrollY,width:Z,height:R},isMultiSelect:!0})}G(null)}else S&&(ci.current=!0);Ql.current=null,Ke.current=null,Rd(!1),Ka.current&&(Ka.current.innerHTML="")};return document.addEventListener("mouseup",c),()=>document.removeEventListener("mouseup",c)},[T,rn]);let Je=(0,E.useCallback)(async(c,d,S)=>{let A=z.webhookUrl||b;if(!A||!z.webhooksEnabled&&!S)return!1;try{return(await fetch(A,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:c,timestamp:Date.now(),url:typeof window<"u"?window.location.href:void 0,...d})})).ok}catch(x){return console.warn("[Agentation] Webhook failed:",x),!1}},[b,z.webhookUrl,z.webhooksEnabled]),b5=(0,E.useCallback)(c=>{if(!D)return;let d={id:Date.now().toString(),x:D.x,y:D.y,comment:c,element:D.element,elementPath:D.elementPath,timestamp:Date.now(),selectedText:D.selectedText,boundingBox:D.boundingBox,nearbyText:D.nearbyText,cssClasses:D.cssClasses,isMultiSelect:D.isMultiSelect,isFixed:D.isFixed,fullPath:D.fullPath,accessibility:D.accessibility,computedStyles:D.computedStyles,nearbyElements:D.nearbyElements,reactComponents:D.reactComponents,elementBoundingBoxes:D.elementBoundingBoxes,...h&&ye?{sessionId:ye,url:typeof window<"u"?window.location.href:void 0,status:"pending"}:{}};f(S=>[...S,d]),ri.current=d.id,st(()=>{ri.current=null},300),st(()=>{Ga(S=>new Set(S).add(d.id))},250),l?.(d),Je("annotation.add",{annotation:d}),ui(!0),st(()=>{le(null),ui(!1)},150),window.getSelection()?.removeAllRanges(),h&&ye&&wi(h,ye,d).then(S=>{S.id!==d.id&&(f(A=>A.map(x=>x.id===d.id?{...x,id:S.id}:x)),Ga(A=>{let x=new Set(A);return x.delete(d.id),x.add(S.id),x}))}).catch(S=>{console.warn("[Agentation] Failed to sync annotation:",S)})},[D,l,Je,h,ye]),v5=(0,E.useCallback)(()=>{ui(!0),st(()=>{le(null),ui(!1)},150)},[]),_u=(0,E.useCallback)(c=>{let d=L.findIndex(A=>A.id===c),S=L[d];P?.id===c&&(Xl(!0),st(()=>{Qa(null),sn(null),rl([]),Xl(!1)},150)),bd(c),si(A=>new Set(A).add(c)),S&&(a?.(S),Je("annotation.delete",{annotation:S})),h&&C_(h,c).catch(A=>{console.warn("[Agentation] Failed to delete annotation from server:",A)}),st(()=>{f(A=>A.filter(x=>x.id!==c)),si(A=>{let x=new Set(A);return x.delete(c),x}),bd(null),d<L.length-1&&(vd(d),st(()=>vd(null),200))},150)},[L,P,a,Je,h]),_i=(0,E.useCallback)(c=>{if(Qa(c),eu(null),cl(null),Xa([]),c.elementBoundingBoxes?.length){let d=[];for(let S of c.elementBoundingBoxes){let A=S.x+S.width/2,x=S.y+S.height/2-window.scrollY,M=Kl(A,x);M&&d.push(M)}rl(d),sn(null)}else if(c.boundingBox){let d=c.boundingBox,S=d.x+d.width/2,A=c.isFixed?d.y+d.height/2:d.y+d.height/2-window.scrollY,x=Kl(S,A);if(x){let M=x.getBoundingClientRect(),Y=M.width/d.width,U=M.height/d.height;Y<.5||U<.5?sn(null):sn(x)}else sn(null);rl([])}else sn(null),rl([])},[]),fi=(0,E.useCallback)(c=>{if(!c){eu(null),cl(null),Xa([]);return}if(eu(c.id),c.elementBoundingBoxes?.length){let d=[];for(let S of c.elementBoundingBoxes){let A=S.x+S.width/2,x=S.y+S.height/2-window.scrollY,Y=document.elementsFromPoint(A,x).find(U=>!U.closest("[data-annotation-marker]")&&!U.closest("[data-agentation-root]"));Y&&d.push(Y)}Xa(d),cl(null)}else if(c.boundingBox){let d=c.boundingBox,S=d.x+d.width/2,A=c.isFixed?d.y+d.height/2:d.y+d.height/2-window.scrollY,x=Kl(S,A);if(x){let M=x.getBoundingClientRect(),Y=M.width/d.width,U=M.height/d.height;Y<.5||U<.5?cl(null):cl(x)}else cl(null);Xa([])}else cl(null),Xa([])},[]),x5=(0,E.useCallback)(c=>{if(!P)return;let d={...P,comment:c};f(S=>S.map(A=>A.id===P.id?d:A)),o?.(d),Je("annotation.update",{annotation:d}),h&&z2(h,P.id,{comment:c}).catch(S=>{console.warn("[Agentation] Failed to update annotation on server:",S)}),Xl(!0),st(()=>{Qa(null),sn(null),rl([]),Xl(!1)},150)},[P,o,Je,h]),C5=(0,E.useCallback)(()=>{Xl(!0),st(()=>{Qa(null),sn(null),rl([]),Xl(!1)},150)},[]),fl=(0,E.useCallback)(()=>{let c=L.length;if(c===0)return;i?.(L),Je("annotations.clear",{annotations:L}),h&&Promise.all(L.map(S=>C_(h,S.id).catch(A=>{console.warn("[Agentation] Failed to delete annotation from server:",A)}))),$e(!0),jt(!0);let d=c*30+200;st(()=>{f([]),Ga(new Set),localStorage.removeItem(Ti(ht)),$e(!1)},d),st(()=>jt(!1),1500)},[ht,L,i,Je,h]),fu=(0,E.useCallback)(async()=>{let c=typeof window<"u"?window.location.pathname+window.location.search+window.location.hash:ht,d=A_(L,c,z.outputDetail,un);if(d){if(m)try{await navigator.clipboard.writeText(d)}catch{}s?.(d),Yl(!0),st(()=>Yl(!1),2e3),z.autoClearAfterCopy&&st(()=>fl(),500)}},[L,ht,z.outputDetail,un,z.autoClearAfterCopy,fl,m,s]),mu=(0,E.useCallback)(async()=>{let c=typeof window<"u"?window.location.pathname+window.location.search+window.location.hash:ht,d=A_(L,c,z.outputDetail,un);if(!d)return;u&&u(d,L),ja("sending"),await new Promise(A=>st(A,150));let S=await Je("submit",{output:d,annotations:L},!0);ja(S?"sent":"failed"),st(()=>ja("idle"),2500),S&&z.autoClearAfterCopy&&st(()=>fl(),500)},[u,Je,L,ht,z.outputDetail,un,z.autoClearAfterCopy,fl]);(0,E.useEffect)(()=>{if(!jl)return;let c=10,d=A=>{let x=A.clientX-jl.x,M=A.clientY-jl.y,Y=Math.sqrt(x*x+M*M);if(!cn&&Y>c&&Dd(!0),cn||Y>c){let U=jl.toolbarX+x,J=jl.toolbarY+M,$=20,j=297,q=44,Z=j-(T?Pt==="connected"?297:257:44),R=$-Z,Me=window.innerWidth-$-j;U=Math.max(R,Math.min(Me,U)),J=Math.max($,Math.min(window.innerHeight-q-$,J)),uu({x:U,y:J})}},S=()=>{cn&&(cu.current=!0),Dd(!1),Bd(null)};return document.addEventListener("mousemove",d),document.addEventListener("mouseup",S),()=>{document.removeEventListener("mousemove",d),document.removeEventListener("mouseup",S)}},[jl,cn,T,Pt]);let S5=(0,E.useCallback)(c=>{if(c.target.closest("button")||c.target.closest(`.${r.settingsPanel}`))return;let d=c.currentTarget.parentElement;if(!d)return;let S=d.getBoundingClientRect(),A=Tt?.x??S.left,x=Tt?.y??S.top,M=(Math.random()-.5)*10;y5(M),Bd({x:c.clientX,y:c.clientY,toolbarX:A,toolbarY:x})},[Tt]);if((0,E.useEffect)(()=>{if(!Tt)return;let c=()=>{let x=Tt.x,M=Tt.y,J=20-(297-(T?Pt==="connected"?297:257:44)),$=window.innerWidth-20-297;x=Math.max(J,Math.min($,x)),M=Math.max(20,Math.min(window.innerHeight-44-20,M)),(x!==Tt.x||M!==Tt.y)&&uu({x,y:M})};return c(),window.addEventListener("resize",c),()=>window.removeEventListener("resize",c)},[Tt,T,Pt]),(0,E.useEffect)(()=>{let c=d=>{let S=d.target,A=S.tagName==="INPUT"||S.tagName==="TEXTAREA"||S.isContentEditable;if(d.key==="Escape"){if(Dt.length>0){Rl([]);return}D||T&&(ae(),O(!1))}if((d.metaKey||d.ctrlKey)&&d.shiftKey&&(d.key==="f"||d.key==="F")){d.preventDefault(),ae(),O(x=>!x);return}if(!(A||d.metaKey||d.ctrlKey)&&((d.key==="p"||d.key==="P")&&(d.preventDefault(),ae(),du()),(d.key==="h"||d.key==="H")&&L.length>0&&(d.preventDefault(),ae(),p(x=>!x)),(d.key==="c"||d.key==="C")&&L.length>0&&(d.preventDefault(),ae(),fu()),(d.key==="x"||d.key==="X")&&L.length>0&&(d.preventDefault(),ae(),fl()),d.key==="s"||d.key==="S")){let x=Ie(z.webhookUrl)||Ie(b||"");L.length>0&&x&&he==="idle"&&(d.preventDefault(),ae(),mu())}};return document.addEventListener("keydown",c),()=>document.removeEventListener("keydown",c)},[T,D,L.length,z.webhookUrl,b,he,mu,du,fu,fl,Dt]),!Ot)return null;let ql=L.length>0,mi=L.filter(c=>!Hd.has(c.id)),Vd=L.filter(c=>Hd.has(c.id)),Kd=c=>{let M=c.x/100*window.innerWidth,Y=typeof c.y=="string"?parseFloat(c.y):c.y,U={};window.innerHeight-Y-22-10<80&&(U.top="auto",U.bottom="calc(100% + 10px)");let $=M-200/2,j=10;if($<j){let q=j-$;U.left=`calc(50% + ${q}px)`}else if($+200>window.innerWidth-j){let q=$+200-(window.innerWidth-j);U.left=`calc(50% - ${q}px)`}return U};return(0,Nu.createPortal)((0,y.jsxs)(y.Fragment,{children:[(0,y.jsx)("div",{className:r.toolbar,"data-feedback-toolbar":!0,style:Tt?{left:Tt.x,top:Tt.y,right:"auto",bottom:"auto"}:void 0,children:(0,y.jsxs)("div",{className:`${r.toolbarContainer} ${F?"":r.light} ${T?r.expanded:r.collapsed} ${Ld?r.entrance:""} ${cn?r.dragging:""} ${!z.webhooksEnabled&&(Ie(z.webhookUrl)||Ie(b||""))?r.serverConnected:""}`,onClick:T?void 0:c=>{if(cu.current){cu.current=!1,c.preventDefault();return}O(!0)},onMouseDown:S5,role:T?void 0:"button",tabIndex:T?-1:0,title:T?void 0:"Start feedback mode",style:{...cn&&{transform:`scale(1.05) rotate(${h5}deg)`,cursor:"grabbing"}},children:[(0,y.jsxs)("div",{className:`${r.toggleContent} ${T?r.hidden:r.visible}`,children:[(0,y.jsx)(l2,{size:24}),ql&&(0,y.jsx)("span",{className:`${r.badge} ${T?r.fadeOut:""} ${Ld?r.entrance:""}`,style:{backgroundColor:z.annotationColor},children:L.length})]}),(0,y.jsxs)("div",{className:`${r.controlsContent} ${T?r.visible:r.hidden} ${Tt&&Tt.y<100?r.tooltipBelow:""} ${f5||qa?r.tooltipsHidden:""}`,onMouseLeave:m5,children:[(0,y.jsxs)("div",{className:`${r.buttonWrapper} ${Tt&&Tt.x<120?r.buttonWrapperAlignLeft:""}`,children:[(0,y.jsx)("button",{className:`${r.controlButton} ${F?"":r.light}`,onClick:c=>{c.stopPropagation(),ae(),du()},"data-active":Qe,children:(0,y.jsx)(s2,{size:24,isPaused:Qe})}),(0,y.jsxs)("span",{className:r.buttonTooltip,children:[Qe?"Resume animations":"Pause animations",(0,y.jsx)("span",{className:r.shortcut,children:"P"})]})]}),(0,y.jsxs)("div",{className:r.buttonWrapper,children:[(0,y.jsx)("button",{className:`${r.controlButton} ${F?"":r.light}`,onClick:c=>{c.stopPropagation(),ae(),p(!_)},disabled:!ql,children:(0,y.jsx)(i2,{size:24,isOpen:_})}),(0,y.jsxs)("span",{className:r.buttonTooltip,children:[_?"Hide markers":"Show markers",(0,y.jsx)("span",{className:r.shortcut,children:"H"})]})]}),(0,y.jsxs)("div",{className:r.buttonWrapper,children:[(0,y.jsx)("button",{className:`${r.controlButton} ${F?"":r.light} ${Bl?r.statusShowing:""}`,onClick:c=>{c.stopPropagation(),ae(),fu()},disabled:!ql,"data-active":Bl,children:(0,y.jsx)(a2,{size:24,copied:Bl})}),(0,y.jsxs)("span",{className:r.buttonTooltip,children:["Copy feedback",(0,y.jsx)("span",{className:r.shortcut,children:"C"})]})]}),(0,y.jsxs)("div",{className:`${r.buttonWrapper} ${r.sendButtonWrapper} ${!z.webhooksEnabled&&(Ie(z.webhookUrl)||Ie(b||""))?r.sendButtonVisible:""}`,children:[(0,y.jsxs)("button",{className:`${r.controlButton} ${F?"":r.light} ${he==="sent"||he==="failed"?r.statusShowing:""}`,onClick:c=>{c.stopPropagation(),ae(),mu()},disabled:!ql||!Ie(z.webhookUrl)&&!Ie(b||"")||he==="sending","data-no-hover":he==="sent"||he==="failed",tabIndex:Ie(z.webhookUrl)||Ie(b||"")?0:-1,children:[(0,y.jsx)(o2,{size:24,state:he}),ql&&he==="idle"&&(0,y.jsx)("span",{className:`${r.buttonBadge} ${F?"":r.light}`,style:{backgroundColor:z.annotationColor},children:L.length})]}),(0,y.jsxs)("span",{className:r.buttonTooltip,children:["Send Annotations",(0,y.jsx)("span",{className:r.shortcut,children:"S"})]})]}),(0,y.jsxs)("div",{className:r.buttonWrapper,children:[(0,y.jsx)("button",{className:`${r.controlButton} ${F?"":r.light}`,onClick:c=>{c.stopPropagation(),ae(),fl()},disabled:!ql,"data-danger":!0,children:(0,y.jsx)(c2,{size:24})}),(0,y.jsxs)("span",{className:r.buttonTooltip,children:["Clear all",(0,y.jsx)("span",{className:r.shortcut,children:"X"})]})]}),(0,y.jsxs)("div",{className:r.buttonWrapper,children:[(0,y.jsx)("button",{className:`${r.controlButton} ${F?"":r.light}`,onClick:c=>{c.stopPropagation(),ae(),Td(!qa)},children:(0,y.jsx)(u2,{size:24})}),h&&Pt!=="disconnected"&&(0,y.jsx)("span",{className:`${r.mcpIndicator} ${F?"":r.light} ${r[Pt]} ${qa?r.hidden:""}`,title:Pt==="connected"?"MCP Connected":"MCP Connecting..."}),(0,y.jsx)("span",{className:r.buttonTooltip,children:"Settings"})]}),(0,y.jsx)("div",{className:`${r.divider} ${F?"":r.light}`}),(0,y.jsxs)("div",{className:`${r.buttonWrapper} ${Tt&&typeof window<"u"&&Tt.x>window.innerWidth-120?r.buttonWrapperAlignRight:""}`,children:[(0,y.jsx)("button",{className:`${r.controlButton} ${F?"":r.light}`,onClick:c=>{c.stopPropagation(),ae(),O(!1)},children:(0,y.jsx)(r2,{size:24})}),(0,y.jsxs)("span",{className:r.buttonTooltip,children:["Exit",(0,y.jsx)("span",{className:r.shortcut,children:"Esc"})]})]})]}),(0,y.jsx)("div",{className:`${r.settingsPanel} ${F?r.dark:r.light} ${_5?r.enter:r.exit}`,onClick:c=>c.stopPropagation(),style:Tt&&Tt.y<230?{bottom:"auto",top:"calc(100% + 0.5rem)"}:void 0,children:(0,y.jsxs)("div",{className:`${r.settingsPanelContainer} ${kd?r.transitioning:""}`,children:[(0,y.jsxs)("div",{className:`${r.settingsPage} ${au==="automations"?r.slideLeft:""}`,children:[(0,y.jsxs)("div",{className:r.settingsHeader,children:[(0,y.jsxs)("span",{className:r.settingsBrand,children:[(0,y.jsx)("span",{className:r.settingsBrandSlash,style:{color:z.annotationColor,transition:"color 0.2s ease"},children:"/"}),"agentation"]}),(0,y.jsxs)("span",{className:r.settingsVersion,children:["v","2.2.1"]}),(0,y.jsx)("button",{className:r.themeToggle,onClick:()=>zd(!F),title:F?"Switch to light mode":"Switch to dark mode",children:(0,y.jsx)("span",{className:r.themeIconWrapper,children:(0,y.jsx)("span",{className:r.themeIcon,children:F?(0,y.jsx)(d2,{size:20}):(0,y.jsx)(_2,{size:20})},F?"sun":"moon")})})]}),(0,y.jsxs)("div",{className:r.settingsSection,children:[(0,y.jsxs)("div",{className:r.settingsRow,children:[(0,y.jsxs)("div",{className:`${r.settingsLabel} ${F?"":r.light}`,children:["Output Detail",(0,y.jsx)(Za,{content:"Controls how much detail is included in the copied output",children:(0,y.jsx)("span",{className:r.helpIcon,children:(0,y.jsx)(Ia,{size:20})})})]}),(0,y.jsxs)("button",{className:`${r.cycleButton} ${F?"":r.light}`,onClick:()=>{let d=(no.findIndex(S=>S.value===z.outputDetail)+1)%no.length;Nn(S=>({...S,outputDetail:no[d].value}))},children:[(0,y.jsx)("span",{className:r.cycleButtonText,children:no.find(c=>c.value===z.outputDetail)?.label},z.outputDetail),(0,y.jsx)("span",{className:r.cycleDots,children:no.map((c,d)=>(0,y.jsx)("span",{className:`${r.cycleDot} ${F?"":r.light} ${z.outputDetail===c.value?r.active:""}`},c.value))})]})]}),(0,y.jsxs)("div",{className:`${r.settingsRow} ${r.settingsRowMarginTop} ${Ul?"":r.settingsRowDisabled}`,children:[(0,y.jsxs)("div",{className:`${r.settingsLabel} ${F?"":r.light}`,children:["React Components",(0,y.jsx)(Za,{content:Ul?"Include React component names in annotations":"Disabled \u2014 production builds minify component names, making detection unreliable. Use on localhost in development mode.",children:(0,y.jsx)("span",{className:r.helpIcon,children:(0,y.jsx)(Ia,{size:20})})})]}),(0,y.jsxs)("label",{className:`${r.toggleSwitch} ${Ul?"":r.disabled}`,children:[(0,y.jsx)("input",{type:"checkbox",checked:Ul&&z.reactEnabled,disabled:!Ul,onChange:()=>Nn(c=>({...c,reactEnabled:!c.reactEnabled}))}),(0,y.jsx)("span",{className:r.toggleSlider})]})]})]}),(0,y.jsxs)("div",{className:r.settingsSection,children:[(0,y.jsx)("div",{className:`${r.settingsLabel} ${r.settingsLabelMarker} ${F?"":r.light}`,children:"Marker Colour"}),(0,y.jsx)("div",{className:r.colorOptions,children:V2.map(c=>(0,y.jsx)("div",{role:"button",onClick:()=>Nn(d=>({...d,annotationColor:c.value})),style:{borderColor:z.annotationColor===c.value?c.value:"transparent"},className:`${r.colorOptionRing} ${z.annotationColor===c.value?r.selected:""}`,children:(0,y.jsx)("div",{className:`${r.colorOption} ${z.annotationColor===c.value?r.selected:""}`,style:{backgroundColor:c.value},title:c.label})},c.value))})]}),(0,y.jsxs)("div",{className:r.settingsSection,children:[(0,y.jsxs)("label",{className:r.settingsToggle,children:[(0,y.jsx)("input",{type:"checkbox",id:"autoClearAfterCopy",checked:z.autoClearAfterCopy,onChange:c=>Nn(d=>({...d,autoClearAfterCopy:c.target.checked}))}),(0,y.jsx)("label",{className:`${r.customCheckbox} ${z.autoClearAfterCopy?r.checked:""}`,htmlFor:"autoClearAfterCopy",children:z.autoClearAfterCopy&&(0,y.jsx)(g_,{size:14})}),(0,y.jsxs)("span",{className:`${r.toggleLabel} ${F?"":r.light}`,children:["Clear on copy/send",(0,y.jsx)(Za,{content:"Automatically clear annotations after copying",children:(0,y.jsx)("span",{className:`${r.helpIcon} ${r.helpIconNudge2}`,children:(0,y.jsx)(Ia,{size:20})})})]})]}),(0,y.jsxs)("label",{className:`${r.settingsToggle} ${r.settingsToggleMarginBottom}`,children:[(0,y.jsx)("input",{type:"checkbox",id:"blockInteractions",checked:z.blockInteractions,onChange:c=>Nn(d=>({...d,blockInteractions:c.target.checked}))}),(0,y.jsx)("label",{className:`${r.customCheckbox} ${z.blockInteractions?r.checked:""}`,htmlFor:"blockInteractions",children:z.blockInteractions&&(0,y.jsx)(g_,{size:14})}),(0,y.jsx)("span",{className:`${r.toggleLabel} ${F?"":r.light}`,children:"Block page interactions"})]})]}),(0,y.jsx)("div",{className:`${r.settingsSection} ${r.settingsSectionExtraPadding}`,children:(0,y.jsxs)("button",{className:`${r.settingsNavLink} ${F?"":r.light}`,onClick:()=>ou("automations"),children:[(0,y.jsx)("span",{children:"Manage MCP & Webhooks"}),(0,y.jsxs)("span",{className:r.settingsNavLinkRight,children:[h&&Pt!=="disconnected"&&(0,y.jsx)("span",{className:`${r.mcpNavIndicator} ${r[Pt]}`}),(0,y.jsx)("svg",{width:"16",height:"16",viewBox:"0 0 16 16",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:(0,y.jsx)("path",{d:"M7.5 12.5L12 8L7.5 3.5",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"})})]})]})})]}),(0,y.jsxs)("div",{className:`${r.settingsPage} ${r.automationsPage} ${au==="automations"?r.slideIn:""}`,children:[(0,y.jsxs)("button",{className:`${r.settingsBackButton} ${F?"":r.light}`,onClick:()=>ou("main"),children:[(0,y.jsx)(m2,{size:16}),(0,y.jsx)("span",{children:"Manage MCP & Webhooks"})]}),(0,y.jsxs)("div",{className:r.settingsSection,children:[(0,y.jsxs)("div",{className:r.settingsRow,children:[(0,y.jsxs)("span",{className:`${r.automationHeader} ${F?"":r.light}`,children:["MCP Connection",(0,y.jsx)(Za,{content:"Connect via Model Context Protocol to let AI agents like Claude Code receive annotations in real-time.",children:(0,y.jsx)("span",{className:`${r.helpIcon} ${r.helpIconNudgeDown}`,children:(0,y.jsx)(Ia,{size:20})})})]}),h&&(0,y.jsx)("div",{className:`${r.mcpStatusDot} ${r[Pt]}`,title:Pt==="connected"?"Connected":Pt==="connecting"?"Connecting...":"Disconnected"})]}),(0,y.jsxs)("p",{className:`${r.automationDescription} ${F?"":r.light}`,style:{paddingBottom:6},children:["MCP connection allows agents to receive and act on annotations."," ",(0,y.jsx)("a",{href:"https://agentation.dev/mcp",target:"_blank",rel:"noopener noreferrer",className:`${r.learnMoreLink} ${F?"":r.light}`,children:"Learn more"})]})]}),(0,y.jsxs)("div",{className:`${r.settingsSection} ${r.settingsSectionGrow}`,children:[(0,y.jsxs)("div",{className:r.settingsRow,children:[(0,y.jsxs)("span",{className:`${r.automationHeader} ${F?"":r.light}`,children:["Webhooks",(0,y.jsx)(Za,{content:"Send annotation data to any URL endpoint when annotations change. Useful for custom integrations.",children:(0,y.jsx)("span",{className:`${r.helpIcon} ${r.helpIconNoNudge}`,children:(0,y.jsx)(Ia,{size:20})})})]}),(0,y.jsxs)("div",{className:r.autoSendRow,children:[(0,y.jsx)("span",{className:`${r.autoSendLabel} ${F?"":r.light} ${z.webhooksEnabled?r.active:""}`,children:"Auto-Send"}),(0,y.jsxs)("label",{className:`${r.toggleSwitch} ${z.webhookUrl?"":r.disabled}`,children:[(0,y.jsx)("input",{type:"checkbox",checked:z.webhooksEnabled,disabled:!z.webhookUrl,onChange:()=>Nn(c=>({...c,webhooksEnabled:!c.webhooksEnabled}))}),(0,y.jsx)("span",{className:r.toggleSlider})]})]})]}),(0,y.jsx)("p",{className:`${r.automationDescription} ${F?"":r.light}`,children:"The webhook URL will receive live annotation changes and annotation data."}),(0,y.jsx)("textarea",{className:`${r.webhookUrlInput} ${F?"":r.light}`,placeholder:"Webhook URL",value:z.webhookUrl,style:{"--marker-color":z.annotationColor},onChange:c=>Nn(d=>({...d,webhookUrl:c.target.value}))})]})]})]})})]})}),(0,y.jsxs)("div",{className:r.markersLayer,"data-feedback-toolbar":!0,children:[C&&mi.filter(c=>!c.isFixed).map((c,d)=>{let S=!X&&oi===c.id,A=pd===c.id,x=(S||A)&&!P,M=c.isMultiSelect,Y=M?"#34C759":z.annotationColor,U=L.findIndex(q=>q.id===c.id),J=!Yd.has(c.id),$=X?r.exit:Hl?r.clearing:J?r.enter:"",j=x&&z.markerClickBehavior==="delete";return(0,y.jsxs)("div",{className:`${r.marker} ${M?r.multiSelect:""} ${$} ${j?r.hovered:""}`,"data-annotation-marker":!0,style:{left:`${c.x}%`,top:c.y,backgroundColor:j?void 0:Y,animationDelay:X?`${(mi.length-1-d)*20}ms`:`${d*20}ms`},onMouseEnter:()=>!X&&c.id!==ri.current&&fi(c),onMouseLeave:()=>fi(null),onClick:q=>{q.stopPropagation(),X||(z.markerClickBehavior==="delete"?_u(c.id):_i(c))},onContextMenu:q=>{z.markerClickBehavior==="delete"&&(q.preventDefault(),q.stopPropagation(),X||_i(c))},children:[x?j?(0,y.jsx)(Su,{size:M?18:16}):(0,y.jsx)(p_,{size:16}):(0,y.jsx)("span",{className:ii!==null&&U>=ii?r.renumber:void 0,children:U+1}),S&&!P&&(0,y.jsxs)("div",{className:`${r.markerTooltip} ${F?"":r.light} ${r.enter}`,style:Kd(c),children:[(0,y.jsxs)("span",{className:r.markerQuote,children:[c.element,c.selectedText&&` "${c.selectedText.slice(0,30)}${c.selectedText.length>30?"...":""}"`]}),(0,y.jsx)("span",{className:r.markerNote,children:c.comment})]})]},c.id)}),C&&!X&&Vd.filter(c=>!c.isFixed).map(c=>{let d=c.isMultiSelect;return(0,y.jsx)("div",{className:`${r.marker} ${r.hovered} ${d?r.multiSelect:""} ${r.exit}`,"data-annotation-marker":!0,style:{left:`${c.x}%`,top:c.y},children:(0,y.jsx)(Su,{size:d?12:10})},c.id)})]}),(0,y.jsxs)("div",{className:r.fixedMarkersLayer,"data-feedback-toolbar":!0,children:[C&&mi.filter(c=>c.isFixed).map((c,d)=>{let S=mi.filter(V=>V.isFixed),A=!X&&oi===c.id,x=pd===c.id,M=(A||x)&&!P,Y=c.isMultiSelect,U=Y?"#34C759":z.annotationColor,J=L.findIndex(V=>V.id===c.id),$=!Yd.has(c.id),j=X?r.exit:Hl?r.clearing:$?r.enter:"",q=M&&z.markerClickBehavior==="delete";return(0,y.jsxs)("div",{className:`${r.marker} ${r.fixed} ${Y?r.multiSelect:""} ${j} ${q?r.hovered:""}`,"data-annotation-marker":!0,style:{left:`${c.x}%`,top:c.y,backgroundColor:q?void 0:U,animationDelay:X?`${(S.length-1-d)*20}ms`:`${d*20}ms`},onMouseEnter:()=>!X&&c.id!==ri.current&&fi(c),onMouseLeave:()=>fi(null),onClick:V=>{V.stopPropagation(),X||(z.markerClickBehavior==="delete"?_u(c.id):_i(c))},onContextMenu:V=>{z.markerClickBehavior==="delete"&&(V.preventDefault(),V.stopPropagation(),X||_i(c))},children:[M?q?(0,y.jsx)(Su,{size:Y?18:16}):(0,y.jsx)(p_,{size:16}):(0,y.jsx)("span",{className:ii!==null&&J>=ii?r.renumber:void 0,children:J+1}),A&&!P&&(0,y.jsxs)("div",{className:`${r.markerTooltip} ${F?"":r.light} ${r.enter}`,style:Kd(c),children:[(0,y.jsxs)("span",{className:r.markerQuote,children:[c.element,c.selectedText&&` "${c.selectedText.slice(0,30)}${c.selectedText.length>30?"...":""}"`]}),(0,y.jsx)("span",{className:r.markerNote,children:c.comment})]})]},c.id)}),C&&!X&&Vd.filter(c=>c.isFixed).map(c=>{let d=c.isMultiSelect;return(0,y.jsx)("div",{className:`${r.marker} ${r.fixed} ${r.hovered} ${d?r.multiSelect:""} ${r.exit}`,"data-annotation-marker":!0,style:{left:`${c.x}%`,top:c.y},children:(0,y.jsx)(e2,{size:d?12:10})},c.id)})]}),T&&(0,y.jsxs)("div",{className:r.overlay,"data-feedback-toolbar":!0,style:D||P?{zIndex:99999}:void 0,children:[H?.rect&&!D&&!Sd&&!rn&&(0,y.jsx)("div",{className:`${r.hoverHighlight} ${r.enter}`,style:{left:H.rect.left,top:H.rect.top,width:H.rect.width,height:H.rect.height,borderColor:`${z.annotationColor}80`,backgroundColor:`${z.annotationColor}0A`}}),Dt.filter(c=>document.contains(c.element)).map((c,d)=>{let S=c.element.getBoundingClientRect(),A=Dt.length>1;return(0,y.jsx)("div",{className:A?r.multiSelectOutline:r.singleSelectOutline,style:{position:"fixed",left:S.left,top:S.top,width:S.width,height:S.height,...A?{}:{borderColor:`${z.annotationColor}99`,backgroundColor:`${z.annotationColor}0D`}}},d)}),oi&&!D&&(()=>{let c=L.find(x=>x.id===oi);if(!c?.boundingBox)return null;if(c.elementBoundingBoxes?.length)return gd.length>0?gd.filter(x=>document.contains(x)).map((x,M)=>{let Y=x.getBoundingClientRect();return(0,y.jsx)("div",{className:`${r.multiSelectOutline} ${r.enter}`,style:{left:Y.left,top:Y.top,width:Y.width,height:Y.height}},`hover-outline-live-${M}`)}):c.elementBoundingBoxes.map((x,M)=>(0,y.jsx)("div",{className:`${r.multiSelectOutline} ${r.enter}`,style:{left:x.x,top:x.y-dl,width:x.width,height:x.height}},`hover-outline-${M}`));let d=nu&&document.contains(nu)?nu.getBoundingClientRect():null,S=d?{x:d.left,y:d.top,width:d.width,height:d.height}:{x:c.boundingBox.x,y:c.isFixed?c.boundingBox.y:c.boundingBox.y-dl,width:c.boundingBox.width,height:c.boundingBox.height},A=c.isMultiSelect;return(0,y.jsx)("div",{className:`${A?r.multiSelectOutline:r.singleSelectOutline} ${r.enter}`,style:{left:S.x,top:S.y,width:S.width,height:S.height,...A?{}:{borderColor:`${z.annotationColor}99`,backgroundColor:`${z.annotationColor}0D`}}})})(),H&&!D&&!Sd&&!rn&&(0,y.jsxs)("div",{className:`${r.hoverTooltip} ${r.enter}`,style:{left:Math.max(8,Math.min(I.x,window.innerWidth-100)),top:Math.max(I.y-(H.reactComponents?48:32),8)},children:[H.reactComponents&&(0,y.jsx)("div",{className:r.hoverReactPath,children:H.reactComponents}),(0,y.jsx)("div",{className:r.hoverElementName,children:H.elementName})]}),D&&(0,y.jsxs)(y.Fragment,{children:[D.multiSelectElements?.length?D.multiSelectElements.filter(c=>document.contains(c)).map((c,d)=>{let S=c.getBoundingClientRect();return(0,y.jsx)("div",{className:`${r.multiSelectOutline} ${$a?r.exit:r.enter}`,style:{left:S.left,top:S.top,width:S.width,height:S.height}},`pending-multi-${d}`)}):D.targetElement&&document.contains(D.targetElement)?(()=>{let c=D.targetElement.getBoundingClientRect();return(0,y.jsx)("div",{className:`${r.singleSelectOutline} ${$a?r.exit:r.enter}`,style:{left:c.left,top:c.top,width:c.width,height:c.height,borderColor:`${z.annotationColor}99`,backgroundColor:`${z.annotationColor}0D`}})})():D.boundingBox&&(0,y.jsx)("div",{className:`${D.isMultiSelect?r.multiSelectOutline:r.singleSelectOutline} ${$a?r.exit:r.enter}`,style:{left:D.boundingBox.x,top:D.boundingBox.y-dl,width:D.boundingBox.width,height:D.boundingBox.height,...D.isMultiSelect?{}:{borderColor:`${z.annotationColor}99`,backgroundColor:`${z.annotationColor}0D`}}}),(()=>{let c=D.x,d=D.isFixed?D.y:D.y-dl;return(0,y.jsxs)(y.Fragment,{children:[(0,y.jsx)("div",{className:`${r.marker} ${r.pending} ${D.isMultiSelect?r.multiSelect:""} ${$a?r.exit:r.enter}`,style:{left:`${c}%`,top:d,backgroundColor:D.isMultiSelect?"#34C759":z.annotationColor},children:(0,y.jsx)(n2,{size:12})}),(0,y.jsx)(v_,{ref:Xd,element:D.element,selectedText:D.selectedText,computedStyles:D.computedStylesObj,placeholder:D.element==="Area selection"?"What should change in this area?":D.isMultiSelect?"Feedback for this group of elements...":"What should change?",onSubmit:b5,onCancel:v5,isExiting:$a,lightMode:!F,accentColor:D.isMultiSelect?"#34C759":z.annotationColor,style:{left:Math.max(160,Math.min(window.innerWidth-160,c/100*window.innerWidth)),...d>window.innerHeight-290?{bottom:window.innerHeight-d+20}:{top:d+20}}})]})})()]}),P&&(0,y.jsxs)(y.Fragment,{children:[P.elementBoundingBoxes?.length?xd.length>0?xd.filter(c=>document.contains(c)).map((c,d)=>{let S=c.getBoundingClientRect();return(0,y.jsx)("div",{className:`${r.multiSelectOutline} ${r.enter}`,style:{left:S.left,top:S.top,width:S.width,height:S.height}},`edit-multi-live-${d}`)}):P.elementBoundingBoxes.map((c,d)=>(0,y.jsx)("div",{className:`${r.multiSelectOutline} ${r.enter}`,style:{left:c.x,top:c.y-dl,width:c.width,height:c.height}},`edit-multi-${d}`)):(()=>{let c=lu&&document.contains(lu)?lu.getBoundingClientRect():null,d=c?{x:c.left,y:c.top,width:c.width,height:c.height}:P.boundingBox?{x:P.boundingBox.x,y:P.isFixed?P.boundingBox.y:P.boundingBox.y-dl,width:P.boundingBox.width,height:P.boundingBox.height}:null;return d?(0,y.jsx)("div",{className:`${P.isMultiSelect?r.multiSelectOutline:r.singleSelectOutline} ${r.enter}`,style:{left:d.x,top:d.y,width:d.width,height:d.height,...P.isMultiSelect?{}:{borderColor:`${z.annotationColor}99`,backgroundColor:`${z.annotationColor}0D`}}}):null})(),(0,y.jsx)(v_,{ref:Qd,element:P.element,selectedText:P.selectedText,computedStyles:E2(P.computedStyles),placeholder:"Edit your feedback...",initialValue:P.comment,submitLabel:"Save",onSubmit:x5,onCancel:C5,onDelete:()=>_u(P.id),isExiting:g5,lightMode:!F,accentColor:P.isMultiSelect?"#34C759":z.annotationColor,style:(()=>{let c=P.isFixed?P.y:P.y-dl;return{left:Math.max(160,Math.min(window.innerWidth-160,P.x/100*window.innerWidth)),...c>window.innerHeight-290?{bottom:window.innerHeight-c+20}:{top:c+20}}})()})]}),rn&&(0,y.jsxs)(y.Fragment,{children:[(0,y.jsx)("div",{ref:Va,className:r.dragSelection}),(0,y.jsx)("div",{ref:Ka,className:r.highlightsContainer})]})]})]}),document.body)}var u5=Dn($l()),c5=Dn(i5()),hd="superset-annotation-root",md="feedback-toolbar-settings",vg="$SUPERSET_WEBHOOK$",on=[],ai=null,me=!1,s5=!1;function xg(t){if(s5||!t)return;s5=!0;let e=window.fetch;window.fetch=function(l,a){let o;if(typeof l=="string"?o=l:l instanceof URL?o=l.href:o=l.url,o===t){let i=a?.body??(l instanceof Request,null);return i&&typeof i=="string"&&console.log(vg+i),Promise.resolve(new Response(JSON.stringify({ok:!0}),{status:200,headers:{"Content-Type":"application/json"}}))}return e.call(window,l,a)}}var Cg='<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>';function Sg(){let t=new MutationObserver(()=>{let e=document.querySelector("[data-feedback-toolbar]");if(!e)return;let n=e.firstElementChild;if(!n)return;let l=n.children[1];if(!l||l.querySelector("[data-superset-autosend]"))return;let a=Array.from(l.children),o=a.findIndex(g=>g.childElementCount===0&&g.tagName==="DIV"&&g.offsetWidth<5);if(o===-1)return;let i=document.createElement("div");i.setAttribute("data-superset-autosend","true");let s=a[0];s&&(i.className=s.className),i.style.position="relative";let u=document.createElement("button"),m=s?.querySelector("button");m&&(u.className=m.className),u.innerHTML=Cg,u.style.opacity=me?"1":"0.4",u.style.color=me?"#fbbf24":"currentColor",u.title=me?"Auto-send: ON (each annotation opens a tab)":"Auto-send: OFF",u.onclick=g=>{g.stopPropagation(),me=!me,u.style.opacity=me?"1":"0.4",u.style.color=me?"#fbbf24":"currentColor",u.title=me?"Auto-send: ON (each annotation opens a tab)":"Auto-send: OFF";let b=i.querySelector("[data-superset-tooltip]");b&&(b.textContent=me?"Auto-send ON":"Auto-send OFF")};let h=document.createElement("span");h.setAttribute("data-superset-tooltip","true");let v=s?.querySelector("span:not(:has(svg))");v&&(h.className=v.className),h.textContent=me?"Auto-send ON":"Auto-send OFF",i.appendChild(u),i.appendChild(h),l.insertBefore(i,a[o]),t.disconnect()});t.observe(document.body,{childList:!0,subtree:!0})}function wg(){new MutationObserver(()=>{let e=document.querySelector("[data-feedback-toolbar]");if(!e)return;let n=e.querySelectorAll("button");for(let l of n)if(l.textContent?.includes("Manage MCP")){let a=l.closest("div");a?.parentElement&&(a.style.display="none")}}).observe(document.body,{childList:!0,subtree:!0})}function r5(){if(document.getElementById(hd))return;let t=window.__supersetWebhookUrl||"";xg(t);try{let l=localStorage.getItem(md);if(l){let a=JSON.parse(l);a.webhooksEnabled=!1,localStorage.setItem(md,JSON.stringify(a))}else localStorage.setItem(md,JSON.stringify({webhooksEnabled:!1}))}catch{}let e=document.createElement("div");e.id=hd,e.style.cssText="position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;",document.body.appendChild(e),ai=c5.default.createRoot(e);let n={copyToClipboard:!1,webhookUrl:t,onAnnotationAdd:l=>{on=[...on,l],me&&t&&fetch(t,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"annotation.add",timestamp:Date.now(),url:window.location.href,annotation:l})}).catch(()=>{})},onAnnotationDelete:l=>{on=on.filter(a=>a.id!==l.id)},onAnnotationUpdate:l=>{on=on.map(a=>a.id===l.id?l:a)},onAnnotationsClear:()=>{on=[]},onSubmit:(l,a)=>{on=a}};ai.render(u5.default.createElement(N_,n)),Sg(),wg()}function Eg(){ai&&(ai.unmount(),ai=null);let t=document.getElementById(hd);t&&t.remove(),on=[],me=!1}function Tg(){return on}window.__supersetAnnotation={destroy:Eg,getAnnotations:Tg,mount:r5,get autoSendEnabled(){return me},set autoSendEnabled(t){me=t}};r5();})();
/*! Bundled license information:

react/cjs/react.production.js:
  (**
   * @license React
   * react.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-dom/cjs/react-dom.production.js:
  (**
   * @license React
   * react-dom.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react-jsx-runtime.production.js:
  (**
   * @license React
   * react-jsx-runtime.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

scheduler/cjs/scheduler.production.js:
  (**
   * @license React
   * scheduler.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-dom/cjs/react-dom-client.production.js:
  (**
   * @license React
   * react-dom-client.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
