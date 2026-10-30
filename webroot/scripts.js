'use strict';

/* ── Shell bridge ─────────────────────────────────────────────────────────── */
const shell = (cmd) => new Promise((res, rej) => {
  const cb = `cb_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
  window[cb] = (err, out) => { delete window[cb]; err===0 ? res(out||'') : rej(out||`err:${err}`); };
  if (typeof ksu !== 'undefined' && ksu.exec) ksu.exec(cmd, '{}', cb);
  else res('DEMO_MODE');
});

const MODID       = 'hmod_zero';
const MODDIR      = '/data/adb/modules/' + MODID;
const CONFIG      = MODDIR + '/config.json';
const STATUS_PATH = MODDIR + '/status.json';
const SERIAL_PATH = MODDIR + '/device.serial';
const SVC_V2      = MODDIR + '/service_v2.sh';
const BOOT_PROPS  = MODDIR + '/spoof_props.prop';
const HUE_FILE    = MODDIR + '/home_hue';
const SAT_FILE    = MODDIR + '/home_sat';
const LIC_BIN     = MODDIR + '/bin/licverify';
const GRANT_PATH  = MODDIR + '/license.grant';

let STATE = {
  config: { active_injections:{}, cpu_spoof:{blacklist:[],cpu_only_packages:[]} },
  deviceDb:[], selectedIdx:0,
  logRunning:false, logTimer:null, logSeen:new Set(),
  phoneOs:'14', phoneSdk:34,
  licensed:false, serial:'—'
};

const BRAND_METRICS = {
  'Motorola': { client: { base: 'android-motorola', ms: 'android-motorola-rvo3', vs: 'android-motorola-rvo3' }, first_api: '35', density: '280' },
  'Samsung':  { client: { base: 'android-samsung', ms: 'android-samsung-ss', vs: 'android-samsung-ss' }, first_api: '34', density: '420' },
  'Xiaomi':   { client: { base: 'android-xiaomi', ms: 'android-xiaomi-rev1', vs: 'android-xiaomi-rev1' }, first_api: '34', density: '440' },
  'Oppo':     { client: { base: 'android-oppo', ms: 'android-oppo-rvo3', vs: 'android-oppo-rvo3' }, first_api: '34', density: '400' },
  'Vivo':     { client: { base: 'android-vivo', ms: 'android-vivo-rvo3', vs: 'android-vivo-rvo3' }, first_api: '34', density: '420' },
  'Google':   { client: { base: 'android-google', ms: '', vs: '' }, first_api: '34', density: '420' },
  'OnePlus':  { client: { base: 'android-oneplus', ms: 'android-oppo-rvo3', vs: 'android-oppo-rvo3' }, first_api: '34', density: '450' },
  'Realme':   { client: { base: 'android-realme', ms: 'android-oppo-rvo3', vs: 'android-oppo-rvo3' }, first_api: '34', density: '400' },
  'Asus':     { client: { base: 'android-asus', ms: 'android-asus', vs: 'android-asus' }, first_api: '34', density: '400' },
  'Poco':     { client: { base: 'android-xiaomi', ms: 'android-xiaomi-rev1', vs: 'android-xiaomi-rev1' }, first_api: '34', density: '440' },
  'Nothing':  { client: { base: 'android-nothing', ms: '', vs: '' }, first_api: '34', density: '420' },
  'Sony':     { client: { base: 'android-sony', ms: 'android-sony', vs: 'android-sony' }, first_api: '34', density: '420' },
  'HONOR':    { client: { base: 'android-honor', ms: '', vs: '' }, first_api: '34', density: '400' },
};

const APP_NAMES = {
  'com.example.learnzygisk':'LearnZygisk (Test)',
  'com.logistics.rider.talabat':'Talabat Rider',
  'com.logistics.rider.hungerstation':'HungerStation Rider',
  'com.ab.driver':'Keeta Driver',
  'com.logistics.rider.foodpanda':'Foodpanda Rider',
  'com.android.vending':'Play Store',
  'com.google.android.gms':'Google Play Services',
  'com.google.android.gsf':'Google Services Framework'
};
const APP_COLORS = {
  'com.example.learnzygisk':'#4a9eff',
  'com.logistics.rider.talabat':'#FF6B35',
  'com.logistics.rider.hungerstation':'#FF9500',
  'com.ab.driver':'#1DB954',
  'com.logistics.rider.foodpanda':'#D70F64',
  'com.android.vending':'#34A853',
  'com.google.android.gms':'#4285F4',
  'com.google.android.gsf':'#FBBC05'
};

/* ── Device DB ──────────────────────────────────────────────────────────── */
const EXT = {
  'Nokia':     [{m:'HMD Global',mod:'Nokia G42 5G',d:'IRM_sprout',p:'IRM'},{m:'HMD Global',mod:'Nokia XR21',d:'SQTR_sprout',p:'SQTR'},{m:'HMD Global',mod:'Nokia X30 5G',d:'SPX_sprout',p:'SPX'},{m:'HMD Global',mod:'Nokia G60 5G',d:'RDR_sprout',p:'RDR'},{m:'HMD Global',mod:'Nokia G22',d:'RG2',p:'RG2'},{m:'HMD Global',mod:'Nokia C32',d:'NC3',p:'NC3'},{m:'HMD Global',mod:'Nokia G21',d:'RM2',p:'RM2'},{m:'HMD Global',mod:'Nokia X20',d:'BGT_sprout',p:'BGT'},{m:'HMD Global',mod:'Nokia G11',d:'RG1',p:'RG1'},{m:'HMD Global',mod:'Nokia C31',d:'NC31',p:'NC31'},{m:'HMD Global',mod:'Nokia G60',d:'RDR2',p:'RDR2'},{m:'HMD Global',mod:'Nokia C22',d:'NC22',p:'NC22'}],
  'Motorola':  [{m:'motorola',mod:'XT2351-1',d:'rtwo',p:'rtwo_g'},{m:'motorola',mod:'XT2301-5',d:'eqs',p:'eqs_g'},{m:'motorola',mod:'XT2311-1',d:'hiphala',p:'hiphala'},{m:'motorola',mod:'XT2451-3',d:'fogo',p:'fogo_g'},{m:'motorola',mod:'XT2429-1',d:'mristretto',p:'mristretto_g'},{m:'motorola',mod:'XT2363-2',d:'bronco',p:'bronco_g'},{m:'motorola',mod:'XT2343-5',d:'devon',p:'devon_g'},{m:'motorola',mod:'XT2321-1',d:'canova',p:'canova_g'},{m:'motorola',mod:'XT2453-3',d:'arrow',p:'arrow_g'},{m:'motorola',mod:'XT2341-5',d:'bangkk',p:'bangkk_g'},{m:'motorola',mod:'XT2415-1',d:'paros',p:'paros_g'},{m:'motorola',mod:'XT2331-1',d:'aion',p:'aion_g'}],
  'Google':    [{m:'Google',mod:'Pixel 7 Pro',d:'cheetah',p:'cheetah'},{m:'Google',mod:'Pixel 9',d:'caiman',p:'caiman'},{m:'Google',mod:'Pixel 7a',d:'lynx',p:'lynx'},{m:'Google',mod:'Pixel 8 Pro',d:'husky',p:'husky'},{m:'Google',mod:'Pixel 9 Pro',d:'caiman',p:'caiman'},{m:'Google',mod:'Pixel 9 Pro XL',d:'komodo',p:'komodo'},{m:'Google',mod:'Pixel 8',d:'shiba',p:'shiba'},{m:'Google',mod:'Pixel 8a',d:'akita',p:'akita'},{m:'Google',mod:'Pixel Fold',d:'felix',p:'felix'},{m:'Google',mod:'Pixel 9 Pro Fold',d:'comet',p:'comet'},{m:'Google',mod:'Pixel 7',d:'panther',p:'panther'},{m:'Google',mod:'Pixel 6 Pro',d:'raven',p:'raven'},{m:'Google',mod:'Pixel 6a',d:'bluejay',p:'bluejay'}],
  'Infinix':   [{m:'Infinix',mod:'X6860',d:'X6860',p:'X6860'},{m:'Infinix',mod:'X6851P',d:'X6851P',p:'X6851P'},{m:'Infinix',mod:'X6837',d:'X6837',p:'X6837'},{m:'Infinix',mod:'X6871',d:'X6871',p:'X6871'},{m:'Infinix',mod:'X6883',d:'X6883',p:'X6883'},{m:'Infinix',mod:'X6725D',d:'X6725D',p:'X6725D'},{m:'Infinix',mod:'X6739',d:'X6739',p:'X6739'},{m:'Infinix',mod:'X6880',d:'X6880',p:'X6880'},{m:'Infinix',mod:'X6852',d:'X6852',p:'X6852'},{m:'Infinix',mod:'X6867',d:'X6867',p:'X6867'},{m:'Infinix',mod:'X6816',d:'X6816',p:'X6816'},{m:'Infinix',mod:'X6720',d:'X6720',p:'X6720'}],
  'TECNO':     [{m:'TECNO',mod:'AD10',d:'AD10',p:'AD10'},{m:'TECNO',mod:'CL9',d:'CL9',p:'CL9'},{m:'TECNO',mod:'KJ7',d:'KJ7',p:'KJ7'},{m:'TECNO',mod:'LI9',d:'LI9',p:'LI9'},{m:'TECNO',mod:'CK9n',d:'CK9n',p:'CK9n'},{m:'TECNO',mod:'BG6',d:'BG6',p:'BG6'},{m:'TECNO',mod:'CL8',d:'CL8',p:'CL8'},{m:'TECNO',mod:'CK8n',d:'CK8n',p:'CK8n'},{m:'TECNO',mod:'LH8n',d:'LH8n',p:'LH8n'},{m:'TECNO',mod:'BF6',d:'BF6',p:'BF6'},{m:'TECNO',mod:'CI8',d:'CI8',p:'CI8'},{m:'TECNO',mod:'AE9',d:'AE9',p:'AE9'}],
  'Sharp':     [{m:'SHARP',mod:'SH-52E',d:'SH-52E',p:'SH52E'},{m:'SHARP',mod:'SH-53E',d:'SH-53E',p:'SH53E'},{m:'SHARP',mod:'SH-51E',d:'SH-51E',p:'SH51E'},{m:'SHARP',mod:'A302SH',d:'A302SH',p:'A302SH'},{m:'SHARP',mod:'SH-54D',d:'SH-54D',p:'SH54D'},{m:'SHARP',mod:'SHG11',d:'SHG11',p:'SHG11'},{m:'SHARP',mod:'A303SH',d:'A303SH',p:'A303SH'},{m:'SHARP',mod:'SH-M25',d:'SH-M25',p:'SHM25'},{m:'SHARP',mod:'SHG09',d:'SHG09',p:'SHG09'},{m:'SHARP',mod:'A203SH',d:'A203SH',p:'A203SH'}],
  'Fairphone': [{m:'Fairphone',mod:'FP5',d:'FP5',p:'FP5'},{m:'Fairphone',mod:'FP4',d:'FP4',p:'FP4'},{m:'Fairphone',mod:'FP6',d:'FP6',p:'FP6'},{m:'Fairphone',mod:'FP3',d:'FP3',p:'FP3'},{m:'Fairphone',mod:'FP3+',d:'FP3plus',p:'FP3plus'},{m:'Fairphone',mod:'FP5 5G',d:'FP5_5G',p:'FP5_5G'},{m:'Fairphone',mod:'FP4 5G',d:'FP4_5G',p:'FP4_5G'},{m:'Fairphone',mod:'FP2',d:'FP2',p:'FP2'},{m:'Fairphone',mod:'FP5 Pro',d:'FP5_Pro',p:'FP5_Pro'},{m:'Fairphone',mod:'FP6 5G',d:'FP6_5G',p:'FP6_5G'}],
  'itel':      [{m:'itel',mod:'S661LPN',d:'S661LPN',p:'S661LPN'},{m:'itel',mod:'A70',d:'A70',p:'A70'},{m:'itel',mod:'P55 5G',d:'itel_P661N',p:'itel_P661N'},{m:'itel',mod:'S665LP',d:'S665LP',p:'S665LP'},{m:'itel',mod:'A665L',d:'A665L',p:'A665L'},{m:'itel',mod:'P40',d:'itel_P651L',p:'itel_P651L'},{m:'itel',mod:'S23+',d:'itel_S665L',p:'itel_S665L'},{m:'itel',mod:'A60S',d:'itel_A662L',p:'itel_A662L'},{m:'itel',mod:'RS4',d:'itel_S666L',p:'itel_S666L'},{m:'itel',mod:'P55+',d:'itel_P662N',p:'itel_P662N'}],
  'BlackShark':[{m:'Black Shark',mod:'SHARK PRS-H0',d:'SHARK PRS-H0',p:'PRS'},{m:'Black Shark',mod:'SHARK PRS-A0',d:'SHARK PRS-A0',p:'PRS'},{m:'Black Shark',mod:'SHARK KTUS-H0',d:'SHARK KTUS-H0',p:'KTUS'},{m:'Black Shark',mod:'SHARK KSR-H0',d:'SHARK KSR-H0',p:'KSR'},{m:'Black Shark',mod:'SHARK PAR-H0',d:'SHARK PAR-H0',p:'PAR'},{m:'Black Shark',mod:'SHARK DLT-H0',d:'SHARK DLT-H0',p:'DLT'},{m:'Black Shark',mod:'SHARK KLE-H0',d:'SHARK KLE-H0',p:'KLE'},{m:'Black Shark',mod:'SHARK MBU-H0',d:'SHARK MBU-H0',p:'MBU'},{m:'Black Shark',mod:'SHARK PhoenixH0',d:'phoenix',p:'phoenix'},{m:'Black Shark',mod:'SHARK KTUS-A0',d:'SHARK KTUS-A0',p:'KTUS'}],
  'Meizu':     [{m:'Meizu',mod:'M6782H',d:'meizu21pro',p:'meizu21pro'},{m:'Meizu',mod:'M6782M',d:'meizu21note',p:'meizu21note'},{m:'Meizu',mod:'M3691',d:'meizu20',p:'meizu20'},{m:'Meizu',mod:'M551H',d:'meizu21',p:'meizu21'},{m:'Meizu',mod:'M471H',d:'meizu20pro',p:'meizu20pro'},{m:'Meizu',mod:'M6781H',d:'meizu21x',p:'meizu21x'},{m:'Meizu',mod:'M3671',d:'meizu20infinity',p:'meizu20infinity'},{m:'Meizu',mod:'M561H',d:'meizu18',p:'meizu18'},{m:'Meizu',mod:'M6772H',d:'meizunote22',p:'meizunote22'},{m:'Meizu',mod:'M472H',d:'meizu19',p:'meizu19'}],
  'Lava':      [{m:'Lava',mod:'L6820',d:'L6820',p:'L6820'},{m:'Lava',mod:'BLAZE2',d:'BLAZE2',p:'BLAZE2'},{m:'Lava',mod:'AGNI2',d:'AGNI2',p:'AGNI2'},{m:'Lava',mod:'L6821',d:'L6821',p:'L6821'},{m:'Lava',mod:'YUVA2',d:'YUVA2',p:'YUVA2'},{m:'Lava',mod:'L6830',d:'L6830',p:'L6830'},{m:'Lava',mod:'BLAZEX',d:'BLAZEX',p:'BLAZEX'},{m:'Lava',mod:'AGNI3',d:'AGNI3',p:'AGNI3'},{m:'Lava',mod:'STORM',d:'STORM',p:'STORM'},{m:'Lava',mod:'YUVA3',d:'YUVA3',p:'YUVA3'}],
  'Micromax':  [{m:'Micromax',mod:'MMXIN2',d:'MMXIN2',p:'MMXIN2'},{m:'Micromax',mod:'E7746',d:'E7746',p:'E7746'},{m:'Micromax',mod:'IN2c',d:'IN2c',p:'IN2c'},{m:'Micromax',mod:'IN2b',d:'IN2b',p:'IN2b'},{m:'Micromax',mod:'E7544',d:'E7544',p:'E7544'},{m:'Micromax',mod:'IN1',d:'IN1',p:'IN1'},{m:'Micromax',mod:'IN1b',d:'IN1b',p:'IN1b'},{m:'Micromax',mod:'E4815',d:'E4815',p:'E4815'},{m:'Micromax',mod:'IN2d',d:'IN2d',p:'IN2d'},{m:'Micromax',mod:'E7447',d:'E7447',p:'E7447'}],
  'Wiko':      [{m:'Wiko',mod:'wiko_hi_enjoy70pro',d:'wiko_hi_enjoy70pro',p:'wiko_hi_enjoy70pro'},{m:'Wiko',mod:'W-V770-EEA',d:'W-V770',p:'W-V770'},{m:'Wiko',mod:'wiko_hi_enjoy60',d:'wiko_hi_enjoy60',p:'wiko_hi_enjoy60'},{m:'Wiko',mod:'W-V760-EEA',d:'W-V760',p:'W-V760'},{m:'Wiko',mod:'W-K610-EEA',d:'W-K610',p:'W-K610'},{m:'Wiko',mod:'wiko_hi_enjoy50',d:'wiko_hi_enjoy50',p:'wiko_hi_enjoy50'},{m:'Wiko',mod:'W-V745-EEA',d:'W-V745',p:'W-V745'},{m:'Wiko',mod:'W-P611-EEA',d:'W-P611',p:'W-P611'},{m:'Wiko',mod:'wiko_hi_enjoy80',d:'wiko_hi_enjoy80',p:'wiko_hi_enjoy80'},{m:'Wiko',mod:'W-V800-EEA',d:'W-V800',p:'W-V800'}],
  'HTC':       [{m:'HTC',mod:'2Q9E100',d:'mtkmt6985',p:'htc_mtkmt6985'},{m:'HTC',mod:'2QBK100',d:'htc_u24pro',p:'htc_u24pro'},{m:'HTC',mod:'2PZF100',d:'htc_desire22pro',p:'htc_desire22pro'},{m:'HTC',mod:'2Q7A100',d:'htc_u23pro',p:'htc_u23pro'},{m:'HTC',mod:'2PYB200',d:'htc_a103',p:'htc_a103'},{m:'HTC',mod:'2QAE100',d:'htc_wildfire',p:'htc_wildfire'},{m:'HTC',mod:'2Q8A100',d:'htc_u23',p:'htc_u23'},{m:'HTC',mod:'2PZH100',d:'htc_a102',p:'htc_a102'},{m:'HTC',mod:'2QBM100',d:'htc_u25pro',p:'htc_u25pro'},{m:'HTC',mod:'2Q6E100',d:'htc_desire21',p:'htc_desire21'}],
  'BLU':       [{m:'BLU',mod:'G0390WW',d:'G0390WW',p:'G0390WW'},{m:'BLU',mod:'G91s',d:'G91s',p:'G91s'},{m:'BLU',mod:'G93',d:'G93',p:'G93'},{m:'BLU',mod:'G53',d:'G53',p:'G53'},{m:'BLU',mod:'G71L',d:'G71L',p:'G71L'},{m:'BLU',mod:'G63',d:'G63',p:'G63'},{m:'BLU',mod:'V91',d:'V91',p:'V91'},{m:'BLU',mod:'G73',d:'G73',p:'G73'},{m:'BLU',mod:'F91',d:'F91',p:'F91'},{m:'BLU',mod:'G43',d:'G43',p:'G43'}],
  'Huawei':    [{m:'HUAWEI',mod:'ALN-AL10',d:'ALN-AL10',p:'ALN-AL10'},{m:'HUAWEI',mod:'BVD-AL10',d:'BVD-AL10',p:'BVD-AL10'},{m:'HUAWEI',mod:'BRA-AL00',d:'BRA-AL00',p:'BRA-AL00'},{m:'HUAWEI',mod:'DCO-AL00',d:'DCO-AL00',p:'DCO-AL00'},{m:'HUAWEI',mod:'PALA-AL00',d:'PALA-AL00',p:'PALA-AL00'},{m:'HUAWEI',mod:'ADY-AL00',d:'ADY-AL00',p:'ADY-AL00'},{m:'HUAWEI',mod:'FOA-AL00',d:'FOA-AL00',p:'FOA-AL00'},{m:'HUAWEI',mod:'LNA-AL00',d:'LNA-AL00',p:'LNA-AL00'},{m:'HUAWEI',mod:'MNA-AL00',d:'MNA-AL00',p:'MNA-AL00'},{m:'HUAWEI',mod:'BRA-AL10',d:'BRA-AL10',p:'BRA-AL10'}],
  'OnePlus':   [{m:'OnePlus',mod:'CPH2581',d:'OP594DL1',p:'CPH2581'},{m:'OnePlus',mod:'CPH2573',d:'OP5953L1',p:'CPH2573'},{m:'OnePlus',mod:'PJD110',d:'OP5954L1',p:'PJD110'},{m:'OnePlus',mod:'CPH2449',d:'OP5552L1',p:'CPH2449'},{m:'OnePlus',mod:'CPH2609',d:'OP5959L1',p:'CPH2609'},{m:'OnePlus',mod:'CPH2655',d:'OP5G2L1',p:'CPH2655'},{m:'OnePlus',mod:'CPH2415',d:'OP5551L1',p:'CPH2415'},{m:'OnePlus',mod:'CPH2513',d:'OP5591L1',p:'CPH2513'},{m:'OnePlus',mod:'PHB110',d:'OP5956L1',p:'PHB110'},{m:'OnePlus',mod:'CPH2447',d:'OP5553L1',p:'CPH2447'},{m:'OnePlus',mod:'PKX110',d:'OP5960L1',p:'PKX110'},{m:'OnePlus',mod:'CPH2617',d:'OP5G1L1',p:'CPH2617'}],
  'Nothing':   [{m:'Nothing',mod:'A142P',d:'Pacman',p:'Pacman'},{m:'Nothing',mod:'A065',d:'Pong',p:'Pong'},{m:'Nothing',mod:'A063',d:'Spacewar',p:'Spacewar'},{m:'Nothing',mod:'A059',d:'Pong',p:'Pong'},{m:'Nothing',mod:'A015',d:'Tetris',p:'Tetris'},{m:'Nothing',mod:'A142',d:'Pacman',p:'Pacman'},{m:'Nothing',mod:'AIN065',d:'PongPro',p:'PongPro'},{m:'Nothing',mod:'A162',d:'Asteroids',p:'Asteroids'},{m:'Nothing',mod:'A016',d:'TetrisPro',p:'TetrisPro'},{m:'Nothing',mod:'A066',d:'PongPlus',p:'PongPlus'}],
  'Sony':      [{m:'Sony',mod:'XQ-EC54',d:'pdx-237',p:'J9110'},{m:'Sony',mod:'XQ-ES54',d:'pdx-239',p:'J8210'},{m:'Sony',mod:'XQ-ES72',d:'pdx-241',p:'I3113'},{m:'Sony',mod:'XQ-DE54',d:'pdx-234',p:'XQ-DE54'},{m:'Sony',mod:'XQ-CT54',d:'pdx-223',p:'XQ-CT54'},{m:'Sony',mod:'XQ-EG54',d:'pdx-238',p:'XQ-EG54'},{m:'Sony',mod:'XQ-DQ54',d:'pdx-235',p:'XQ-DQ54'},{m:'Sony',mod:'XQ-BC72',d:'pdx-225',p:'XQ-BC72'},{m:'Sony',mod:'XQ-FS54',d:'pdx-245',p:'XQ-FS54'},{m:'Sony',mod:'XQ-AS72',d:'pdx-206',p:'XQ-AS72'}],
  'HONOR':     [{m:'HONOR',mod:'ALI-AN00',d:'ALI-AN00',p:'ALI-AN00'},{m:'HONOR',mod:'REA-NX9',d:'REA-NX9',p:'REA-NX9'},{m:'HONOR',mod:'BVL-AN16',d:'BVL-AN16',p:'BVL-AN16'},{m:'HONOR',mod:'PGT-N19',d:'PGT-N19',p:'PGT-N19'},{m:'HONOR',mod:'FCP-AN10',d:'FCP-AN10',p:'FCP-AN10'},{m:'HONOR',mod:'CMA-LX1',d:'CMA-LX1',p:'CMA-LX1'},{m:'HONOR',mod:'ELI-NX9',d:'ELI-NX9',p:'ELI-NX9'},{m:'HONOR',mod:'ADT-AN00',d:'ADT-AN00',p:'ADT-AN00'},{m:'HONOR',mod:'VNE-AN40',d:'VNE-AN40',p:'VNE-AN40'},{m:'HONOR',mod:'GDX-AN00',d:'GDX-AN00',p:'GDX-AN00'},{m:'HONOR',mod:'CRT-NX1',d:'CRT-NX1',p:'CRT-NX1'},{m:'HONOR',mod:'RMO-NX3',d:'RMO-NX3',p:'RMO-NX3'}],
  'Poco':      [{m:'Xiaomi',mod:'2311DRK48G',d:'aurora',p:'aurora_global'},{m:'Xiaomi',mod:'24069PC21G',d:'peridot',p:'peridot_global'},{m:'Xiaomi',mod:'23013PC75G',d:'munch',p:'munch_global'},{m:'Xiaomi',mod:'24094RAD4G',d:'chenfeng',p:'chenfeng_global'},{m:'Xiaomi',mod:'23122PCD1G',d:'duchamp',p:'duchamp_global'},{m:'Xiaomi',mod:'2312FPCA6G',d:'vermeer',p:'vermeer_global'},{m:'Xiaomi',mod:'24129PN74G',d:'manet',p:'manet_global'},{m:'Xiaomi',mod:'23049PCD8G',d:'garnet',p:'garnet_global'},{m:'Xiaomi',mod:'2409BRN2CG',d:'rothko',p:'rothko_global'},{m:'Xiaomi',mod:'22127PC95G',d:'fuxi',p:'fuxi_global'}],
  'TCL':       [{m:'TCL',mod:'T612B',d:'TCL_T612B',p:'T612B_JP'},{m:'TCL',mod:'T610K',d:'TCL_T610K',p:'T610K_EU'},{m:'TCL',mod:'T767H',d:'TCL_T767H',p:'T767H'},{m:'TCL',mod:'T811H',d:'TCL_T811H',p:'T811H'},{m:'TCL',mod:'T780H',d:'TCL_T780H',p:'T780H'},{m:'TCL',mod:'T509K',d:'TCL_T509K',p:'T509K'},{m:'TCL',mod:'T608M',d:'TCL_T608M',p:'T608M'},{m:'TCL',mod:'T676H',d:'TCL_T676H',p:'T676H'},{m:'TCL',mod:'T614K',d:'TCL_T614K',p:'T614K'},{m:'TCL',mod:'T770H',d:'TCL_T770H',p:'T770H'}],
  'ZTE':       [{m:'ZTE',mod:'ZTE 9046N',d:'jaguar',p:'jaguar'},{m:'ZTE',mod:'ZTE A2024G',d:'gemini',p:'gemini'},{m:'ZTE',mod:'ZTE 8046',d:'libra',p:'libra'},{m:'ZTE',mod:'ZTE A2025',d:'aquila',p:'aquila'},{m:'ZTE',mod:'ZTE 9047',d:'leo',p:'leo'},{m:'ZTE',mod:'ZTE A2026',d:'orion',p:'orion'},{m:'ZTE',mod:'ZTE 8047',d:'virgo',p:'virgo'},{m:'ZTE',mod:'ZTE A2027',d:'taurus',p:'taurus'},{m:'ZTE',mod:'ZTE 9048',d:'draco',p:'draco'},{m:'ZTE',mod:'ZTE A2028',d:'lyra',p:'lyra'}],
  'Nubia':     [{m:'nubia',mod:'NX721J',d:'NX721J',p:'NX721J'},{m:'nubia',mod:'NX724J',d:'NX724J',p:'NX724J'},{m:'nubia',mod:'NX729J',d:'NX729J',p:'NX729J'},{m:'nubia',mod:'NX712J',d:'NX712J',p:'NX712J'},{m:'nubia',mod:'NX717J',d:'NX717J',p:'NX717J'},{m:'nubia',mod:'NX733J',d:'NX733J',p:'NX733J'},{m:'nubia',mod:'NX726J',d:'NX726J',p:'NX726J'},{m:'nubia',mod:'NX709J',d:'NX709J',p:'NX709J'},{m:'nubia',mod:'NX735J',d:'NX735J',p:'NX735J'},{m:'nubia',mod:'NX719J',d:'NX719J',p:'NX719J'}],
  'iQOO':      [{m:'vivo',mod:'V2324A',d:'V2324A',p:'V2324A'},{m:'vivo',mod:'I2301',d:'I2301',p:'I2301'},{m:'vivo',mod:'V2415A',d:'V2415A',p:'V2415A'},{m:'vivo',mod:'I2017',d:'I2017',p:'I2017'},{m:'vivo',mod:'V2338A',d:'V2338A',p:'V2338A'},{m:'vivo',mod:'I2225',d:'I2225',p:'I2225'},{m:'vivo',mod:'V2359A',d:'V2359A',p:'V2359A'},{m:'vivo',mod:'I2401',d:'I2401',p:'I2401'},{m:'vivo',mod:'V2307A',d:'V2307A',p:'V2307A'},{m:'vivo',mod:'I2216',d:'I2216',p:'I2216'}],
  'Redmagic':  [{m:'ZTE',mod:'NX769J',d:'NX769J',p:'NX769J'},{m:'ZTE',mod:'NX779J',d:'NX779J',p:'NX779J'},{m:'ZTE',mod:'NX759J',d:'NX759J',p:'NX759J'},{m:'ZTE',mod:'NX749J',d:'NX749J',p:'NX749J'},{m:'ZTE',mod:'NX789J',d:'NX789J',p:'NX789J'},{m:'ZTE',mod:'NX765J',d:'NX765J',p:'NX765J'},{m:'ZTE',mod:'NX773J',d:'NX773J',p:'NX773J'},{m:'ZTE',mod:'NX755J',d:'NX755J',p:'NX755J'},{m:'ZTE',mod:'NX781J',d:'NX781J',p:'NX781J'},{m:'ZTE',mod:'NX729J',d:'NX729J_rm',p:'NX729J_rm'}],
  'Doogee':    [{m:'DOOGEE',mod:'S110',d:'S110',p:'S110'},{m:'DOOGEE',mod:'V30T',d:'V30T',p:'V30T'},{m:'DOOGEE',mod:'N50 Pro',d:'N50_Pro',p:'N50_Pro'},{m:'DOOGEE',mod:'S118',d:'S118',p:'S118'},{m:'DOOGEE',mod:'V Max',d:'V_Max',p:'V_Max'},{m:'DOOGEE',mod:'S100 Pro',d:'S100_Pro',p:'S100_Pro'},{m:'DOOGEE',mod:'V30',d:'V30',p:'V30'},{m:'DOOGEE',mod:'N60 Pro',d:'N60_Pro',p:'N60_Pro'},{m:'DOOGEE',mod:'Blade GT',d:'Blade_GT',p:'Blade_GT'},{m:'DOOGEE',mod:'S200',d:'S200',p:'S200'}],
  'Ulefone':   [{m:'Ulefone',mod:'Armor 24',d:'Armor_24',p:'Armor_24'},{m:'Ulefone',mod:'Power Armor 19',d:'Power_Armor_19',p:'Power_Armor_19'},{m:'Ulefone',mod:'Note 16 Pro',d:'Note_16_Pro',p:'Note_16_Pro'},{m:'Ulefone',mod:'Armor 27',d:'Armor_27',p:'Armor_27'},{m:'Ulefone',mod:'Armor 26 Ultra',d:'Armor_26_Ultra',p:'Armor_26_Ultra'},{m:'Ulefone',mod:'Note 18 Ultra',d:'Note_18_Ultra',p:'Note_18_Ultra'},{m:'Ulefone',mod:'Armor 25T Pro',d:'Armor_25T_Pro',p:'Armor_25T_Pro'},{m:'Ulefone',mod:'Power Armor 18T',d:'Power_Armor_18T',p:'Power_Armor_18T'},{m:'Ulefone',mod:'Note 17 Pro',d:'Note_17_Pro',p:'Note_17_Pro'},{m:'Ulefone',mod:'Armor X13',d:'Armor_X13',p:'Armor_X13'}],
  'Cubot':     [{m:'CUBOT',mod:'KingKong 9',d:'KingKong_9',p:'KingKong_9'},{m:'CUBOT',mod:'P80',d:'P80',p:'P80'},{m:'CUBOT',mod:'X70',d:'X70',p:'X70'},{m:'CUBOT',mod:'KingKong Star',d:'KingKong_Star',p:'KingKong_Star'},{m:'CUBOT',mod:'KingKong 10',d:'KingKong_10',p:'KingKong_10'},{m:'CUBOT',mod:'P90',d:'P90',p:'P90'},{m:'CUBOT',mod:'Note 50',d:'Note_50',p:'Note_50'},{m:'CUBOT',mod:'KingKong Power 3',d:'KingKong_Power_3',p:'KingKong_Power_3'},{m:'CUBOT',mod:'A20',d:'A20',p:'A20'},{m:'CUBOT',mod:'X80',d:'X80',p:'X80'}],
  'Umidigi':   [{m:'UMIDIGI',mod:'G9 5G',d:'G9_5G',p:'G9_5G'},{m:'UMIDIGI',mod:'A15C',d:'A15C',p:'A15C'},{m:'UMIDIGI',mod:'Bison X20',d:'Bison_X20',p:'Bison_X20'},{m:'UMIDIGI',mod:'G5 Mecha',d:'G5_Mecha',p:'G5_Mecha'},{m:'UMIDIGI',mod:'G9A',d:'G9A',p:'G9A'},{m:'UMIDIGI',mod:'A15',d:'A15',p:'A15'},{m:'UMIDIGI',mod:'Bison X30',d:'Bison_X30',p:'Bison_X30'},{m:'UMIDIGI',mod:'G7',d:'G7',p:'G7'},{m:'UMIDIGI',mod:'Note 25',d:'Note_25',p:'Note_25'},{m:'UMIDIGI',mod:'G6 5G',d:'G6_5G',p:'G6_5G'}],
};
// Verified real Samsung devices (model / codename / product) so generated
// fingerprints survive a device-database lookup instead of using invented codenames.
const SAMSUNG_MODELS = [
  {mod:'SM-S928B',d:'e3q',p:'e3qeea'},   {mod:'SM-S926B',d:'e2q',p:'e2qeea'},
  {mod:'SM-S921B',d:'e1q',p:'e1qeea'},   {mod:'SM-S918B',d:'dm3q',p:'dm3qeea'},
  {mod:'SM-S916B',d:'dm2q',p:'dm2qeea'}, {mod:'SM-S911B',d:'dm1q',p:'dm1qeea'},
  {mod:'SM-S908B',d:'b0q',p:'b0qeea'},   {mod:'SM-S906B',d:'g0q',p:'g0qeea'},
  {mod:'SM-F946B',d:'q5q',p:'q5qeea'},   {mod:'SM-F731B',d:'b5q',p:'b5qeea'},
  {mod:'SM-A546B',d:'a54x',p:'a54xeea'}, {mod:'SM-A346B',d:'a34x',p:'a34xeea'},
  {mod:'SM-A556B',d:'a55x',p:'a55xeea'}, {mod:'SM-A155F',d:'a15',p:'a15nsxx'},
];
// Verified matched triples (model / codename / product). Using real pairs means a
// detector that cross-references model↔codename can't catch a mismatch.
const XIAOMI_MODELS = [
  {mod:'2201123G',d:'cupid',p:'cupid_global'},      {mod:'2211133G',d:'fuxi',p:'fuxi_global'},
  {mod:'2210132G',d:'nuwa',p:'nuwa_global'},        {mod:'23127PN0CG',d:'houji',p:'houji_global'},
  {mod:'24030PN60G',d:'aurora',p:'aurora_global'},  {mod:'23078PND5G',d:'corot',p:'corot_global'},
];
const ASUS_MODELS = [
  {mod:'ASUS_AI2202',d:'AI2202',p:'WW_AI2202'},     {mod:'ASUS_AI2302',d:'AI2302',p:'WW_AI2302'},
  {mod:'ASUS_AI2205',d:'AI2205',p:'WW_AI2205'},     {mod:'ASUS_AI2401',d:'AI2401',p:'WW_AI2401'},
];
const ALL_BRANDS = ['Samsung','Xiaomi','Oppo','Vivo','Realme','Asus',...Object.keys(EXT)].sort();
const BRAND_SEL  = document.getElementById('sel-brand');
ALL_BRANDS.forEach(b=>{const o=document.createElement('option');o.value=b;o.textContent=b;BRAND_SEL.appendChild(o);});

const CPU_POOL = {
  samsung: [{abi:'arm64-v8a',platform:'exynos2200',hardware:'exynos2200'},{abi:'arm64-v8a',platform:'exynos2400',hardware:'exynos2400'},{abi:'arm64-v8a',platform:'exynos1380',hardware:'s5e8835'},{abi:'arm64-v8a',platform:'sm8650',hardware:'qcom'},{abi:'arm64-v8a',platform:'sm8750',hardware:'qcom'},{abi:'arm64-v8a',platform:'mt6877',hardware:'mt6877'}],
  google:  [{abi:'arm64-v8a',platform:'tensor_g4',hardware:'tensor'},{abi:'arm64-v8a',platform:'gs201',hardware:'tensor'},{abi:'arm64-v8a',platform:'zuma',hardware:'tensor'},{abi:'arm64-v8a',platform:'zumapro',hardware:'tensor'}],
  motorola:[{abi:'arm64-v8a',platform:'mt6985',hardware:'mt6985'},{abi:'arm64-v8a',platform:'sm7475',hardware:'qcom'},{abi:'arm64-v8a',platform:'sm6375',hardware:'qcom'},{abi:'arm64-v8a',platform:'mt6833',hardware:'mt6833'}],
  huawei:  [{abi:'arm64-v8a',platform:'kirin9000',hardware:'kirin990'},{abi:'arm64-v8a',platform:'kirin9000s',hardware:'kirin9000s'},{abi:'arm64-v8a',platform:'kirin9010',hardware:'kirin9010'}],
  honor:   [{abi:'arm64-v8a',platform:'sm8650',hardware:'qcom'},{abi:'arm64-v8a',platform:'kirin9000',hardware:'kirin'},{abi:'arm64-v8a',platform:'mt6886',hardware:'mt6886'}],
  oneplus: [{abi:'arm64-v8a',platform:'sm8650',hardware:'qcom'},{abi:'arm64-v8a',platform:'sm8750',hardware:'qcom'},{abi:'arm64-v8a',platform:'mt6989',hardware:'mt6989'}],
  xiaomi:  [{abi:'arm64-v8a',platform:'sm8650',hardware:'qcom'},{abi:'arm64-v8a',platform:'sm8635',hardware:'qcom'},{abi:'arm64-v8a',platform:'mt6985',hardware:'mt6985'},{abi:'arm64-v8a',platform:'mt6989',hardware:'mt6989'}],
  oppo:    [{abi:'arm64-v8a',platform:'mt6985',hardware:'mt6985'},{abi:'arm64-v8a',platform:'sm7550',hardware:'qcom'},{abi:'arm64-v8a',platform:'sm8650',hardware:'qcom'}],
  realme:  [{abi:'arm64-v8a',platform:'mt6886',hardware:'mt6886'},{abi:'arm64-v8a',platform:'sm7435',hardware:'qcom'},{abi:'arm64-v8a',platform:'mt6985',hardware:'mt6985'}],
  vivo:    [{abi:'arm64-v8a',platform:'mt6985',hardware:'mt6985'},{abi:'arm64-v8a',platform:'sm8635',hardware:'qcom'},{abi:'arm64-v8a',platform:'sm8650',hardware:'qcom'},{abi:'arm64-v8a',platform:'mt6878',hardware:'mt6878'}],
  infinix: [{abi:'arm64-v8a',platform:'mt6789',hardware:'mt6789'},{abi:'arm64-v8a',platform:'mt6835',hardware:'mt6835'},{abi:'arm64-v8a',platform:'mt6769',hardware:'mt6769'}],
  tecno:   [{abi:'arm64-v8a',platform:'mt6789',hardware:'mt6789'},{abi:'arm64-v8a',platform:'mt6835',hardware:'mt6835'},{abi:'arm64-v8a',platform:'mt6768',hardware:'mt6768'}],
  itel:    [{abi:'arm64-v8a',platform:'mt6761',hardware:'mt6761'},{abi:'arm64-v8a',platform:'mt6765',hardware:'mt6765'}],
  zte:     [{abi:'arm64-v8a',platform:'mt6877',hardware:'mt6877'},{abi:'arm64-v8a',platform:'sm6375',hardware:'qcom'},{abi:'arm64-v8a',platform:'sm7325',hardware:'qcom'}],
  nubia:   [{abi:'arm64-v8a',platform:'sm8650',hardware:'qcom'},{abi:'arm64-v8a',platform:'sm8750',hardware:'qcom'},{abi:'arm64-v8a',platform:'sm8550',hardware:'qcom'}],
  doogee:  [{abi:'arm64-v8a',platform:'mt6789',hardware:'mt6789'},{abi:'arm64-v8a',platform:'mt6769',hardware:'mt6769'},{abi:'arm64-v8a',platform:'mt6835',hardware:'mt6835'}],
  ulefone: [{abi:'arm64-v8a',platform:'mt6789',hardware:'mt6789'},{abi:'arm64-v8a',platform:'mt6835',hardware:'mt6835'},{abi:'arm64-v8a',platform:'mt6833',hardware:'mt6833'}],
  cubot:   [{abi:'arm64-v8a',platform:'mt6769',hardware:'mt6769'},{abi:'arm64-v8a',platform:'mt6761',hardware:'mt6761'}],
  umidigi: [{abi:'arm64-v8a',platform:'mt6789',hardware:'mt6789'},{abi:'arm64-v8a',platform:'mt6833',hardware:'mt6833'}],
  default: [{abi:'arm64-v8a',platform:'sm8650',hardware:'qcom'},{abi:'arm64-v8a',platform:'mt6985',hardware:'mt6985'},{abi:'arm64-v8a',platform:'sm7550',hardware:'qcom'}]
};
function pickCpu(b){const p=CPU_POOL[b.toLowerCase()]||CPU_POOL.default;return p[Math.floor(Math.random()*p.length)];}

const SIM_OPS=[
  {mcc:'419',mnc:'03',name:'Ooredoo BH',iso:'bh'},{mcc:'419',mnc:'02',name:'Zain BH',iso:'bh'},
  {mcc:'426',mnc:'01',name:'Batelco',iso:'bh'},{mcc:'418',mnc:'20',name:'Zain KW',iso:'kw'},
  {mcc:'310',mnc:'260',name:'T-Mobile',iso:'us'},{mcc:'234',mnc:'15',name:'Vodafone UK',iso:'gb'},
  {mcc:'404',mnc:'45',name:'Airtel IN',iso:'in'},{mcc:'410',mnc:'01',name:'Jazz PK',iso:'pk'}
];
function luhn(n){let s=0,a=false;for(let i=n.length-1;i>=0;i--){let d=parseInt(n[i],10);if(a){d*=2;if(d>9)d-=9;}s+=d;a=!a;}return(10-(s%10))%10;}
function genSim(ri,rs){
  const op=SIM_OPS[Math.floor(Math.random()*SIM_OPS.length)];
  const t=rs(8,'0123456789'),sn=rs(6,'0123456789'),i14=t+sn,imei=i14+luhn(i14);
  const msin=rs(10,'0123456789'),imsi=op.mcc+op.mnc.padStart(2,'0')+msin;
  const iccB='89'+op.mcc.slice(0,2)+rs(13,'0123456789'),iccid=iccB+luhn(iccB);
  const phone='+'+op.mcc.slice(0,3)+rs(8,'0123456789');
  return{sim_imsi:imsi,sim_imei:imei,sim_iccid:iccid,sim_phone:phone,
    sim_operator:op.mcc+op.mnc.padStart(2,'0'),sim_country:op.iso,sim_operator_name:op.name};
}
// OS-consistent build date, within the plausible window for the OS version and
// never in the future. Drives both the build-ID and the security patch so they
// always agree (a 2023 patch on Android 15, or a patch older than the build, was a tell).
function pickBuildDate(ri,sdk){
  const now=new Date(),nowY=now.getFullYear(),nowM=now.getMonth()+1;
  let minY = sdk>=35?2024 : sdk===34?2023 : sdk===33?2022 : sdk>=31?2021 : 2020;
  let y=ri(minY,nowY), m=ri(1,12);
  if(y===nowY && m>nowM) m=ri(1,nowM);      // cap to current month, no future dates
  return {y, m, d:ri(1,28)};
}

// Random helpers (module scope, reused by buildDevice).
const _rnd=a=>a[Math.floor(Math.random()*a.length)];
const _ri=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const _rs=(n,c)=>Array.from({length:n},()=>c[Math.floor(Math.random()*c.length)]).join('');
// Build ONE realistic device profile for the given brand and OS {os, sdk}.
// NOTE: sdk_int is stored as a STRING — the native config parser reads quoted
// values only, so a numeric sdk_int silently fell back to 34 (Android 14). This
// is why "select Android 16 → injects 14" happened. String fixes it.
function buildDevice(brand,o){
  const rnd=_rnd,ri=_ri,rs=_rs;
  const first=o.sdk>=36?'B':o.sdk>=35?'A':o.sdk>=34?'U':o.sdk===33?'T':o.sdk===32?'S':o.sdk===31?'Q':o.sdk===30?'P':'R';
  const bdt=pickBuildDate(ri,o.sdk);
  const yy=String(bdt.y%100).padStart(2,'0'),MM=String(bdt.m).padStart(2,'0'),DD=String(bdt.d).padStart(2,'0');
  const bid=`${first}${rnd(['P','Q','R'])}${ri(1,3)}${rnd(['A','B','C'])}.${yy}${MM}${DD}.${String(ri(1,999)).padStart(3,'0')}`;
  const inc=rs(8,'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
  let mfr=brand,model,device,product,fpb=brand.toLowerCase();
  if(brand==='Samsung'){const t=rnd(SAMSUNG_MODELS);model=t.mod;device=t.d;product=t.p;fpb='samsung';mfr='samsung';}
  else if(brand==='Xiaomi'){const t=rnd(XIAOMI_MODELS);model=t.mod;device=t.d;product=t.p;fpb='Xiaomi';mfr='Xiaomi';}
  else if(brand==='Oppo'){model=`CPH${ri(2000,2600)}`;device=`OP${ri(4000,5999)}L1`;product=device;fpb='oppo';}
  else if(brand==='Vivo'){model=`V${ri(23,24)}${ri(10,99)}${rnd(['A','B'])}`;device=`PD${ri(2200,2400)}`;product=device;fpb='vivo';}
  else if(brand==='Realme'){model=`RMX${ri(3600,3999)}`;device=`RE${rs(4,'0123456789ABCDEF')}L1`;product=device;fpb='realme';}
  else if(brand==='Asus'){const t=rnd(ASUS_MODELS);model=t.mod;device=t.d;product=t.p;fpb='asus';mfr='asus';}
  else if(EXT[brand]){const t=rnd(EXT[brand]);mfr=t.m;model=t.mod;device=t.d;product=t.p;
    if(['Google','Motorola'].includes(brand))fpb=brand.toLowerCase();
    else if(['TECNO','HONOR','SHARP','HTC','BLU','HUAWEI'].includes(brand))fpb=brand.toUpperCase();
    else if(brand==='OnePlus')fpb='OnePlus';
    else if(brand==='Poco')fpb='xiaomi';
    else if(brand==='iQOO')fpb='vivo';
    else if(brand==='Redmagic')fpb='nubia';
    else fpb=t.m.toLowerCase();}
  const cpu=pickCpu(fpb),security_patch=`${bdt.y}-${MM}-05`;
  const metrics=BRAND_METRICS[brand]||{client:{base:`android-${brand.toLowerCase()}`,ms:'',vs:''},first_api:String(o.sdk),density:'320'};
  const _upper='ABCDEFGHJKLMNPQRSTUVWXYZ',_digits='0123456789',_alnum=_upper+_digits;
  let serial;
  switch(brand){
    case'Samsung':serial=`R${rnd(_upper.split(''))}${ri(0,9)}${rnd(_upper.split(''))}${rs(6,_alnum)}`;break;
    case'Google':serial=`${rnd(['HT','FA'])}${rs(8,_alnum)}`;break;
    case'Xiaomi':serial=`${rs(2,_upper)}${rs(8,_alnum)}`;break;
    case'Oppo':serial=`CPH${rs(7,_alnum)}`;break;
    case'Vivo':serial=`V${ri(100000000,999999999)}`;break;
    case'Realme':serial=`RMX${rs(7,_alnum)}`;break;
    case'OnePlus':serial=rs(10,_alnum);break;
    default:serial=rs(ri(10,12),_alnum);break;
  }
  const android_id=rs(16,'0123456789abcdef');
  const vbmeta_digest=rs(64,'0123456789abcdef');
  const bootloader=`${(device||product||'BL').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)||'BL'}${ri(1,9)}.${String(ri(0,9999)).padStart(4,'0')}.${ri(1,12)}`;
  const radio=`g${rs(12,'0123456789')}-${rs(6,'0123456789')}`;
  const buildDateUtc='1789437137';
  const buildDate=new Date(1789437137*1000).toUTCString();
  const sim=genSim(ri,rs);
  return {brand,manufacturer:mfr,model,device,product,
    fingerprint:`${fpb}/${product}/${device}:${o.os}/${bid}/${inc}:user/release-keys`,
    android_version:o.os,sdk_int:String(o.sdk),build_id:bid,display_id:bid,security_patch,
    serial,android_id,vbmeta_digest,hardware:cpu.hardware,cpu_abi:cpu.abi,cpu_platform:cpu.platform,
    cpu_abilist:'arm64-v8a,armeabi-v7a,armeabi',cpu_abilist32:'armeabi-v7a,armeabi',cpu_abilist64:'arm64-v8a',
    board:cpu.platform,soc_model:cpu.platform,soc_manufacturer:socMfr(cpu.platform),
    incremental:inc,host:'android-build',user:'builder',
    bootloader,radio,build_date:buildDate,build_date_utc:buildDateUtc,
    clientidbase:metrics.client.base,clientidbase_ms:metrics.client.ms,clientidbase_vs:metrics.client.vs,
    lcd_density:metrics.density,first_api_level:metrics.first_api,
    ...sim,_ui_profile:`${brand} — ${model}`};
}
function generateDevices(){
  const brand=BRAND_SEL.value;
  const andSel=document.getElementById('sel-android');
  let phoneOs=andSel&&andSel.value!=='auto'
    ?(p=>({os:p[1],sdk:parseInt(p[0])}))(andSel.value.split('|'))
    :{os:STATE.phoneOs||'14',sdk:STATE.phoneSdk||34};
  const btn=document.getElementById('btn-generate');
  btn.textContent='Generating…';btn.disabled=true;
  setTimeout(()=>{
    const db=[];
    for(let i=0;i<300;i++) db.push(buildDevice(brand,phoneOs));
    STATE.deviceDb=db;STATE.selectedIdx=0;
    renderDeviceList();
    document.getElementById('device-list-wrap').style.display='block';
    document.getElementById('db-count').textContent=`300 Profiles — ${brand}`;
    const inj=document.getElementById('btn-inject');
    if(STATE.licensed){inj.disabled=false;inj.textContent='Inject — Saves Automatically';}
    else{inj.disabled=true;inj.textContent='Activate license to inject';}
    updateSelLabel();
    btn.textContent=`Regenerate ${brand}`;btn.disabled=false;
    addLog(`Generated 300 ${brand} profiles`,'ok');
  },100);
}
function renderDeviceList(){
  const list=document.getElementById('device-list');
  const qEl=document.getElementById('dev-search');
  const q=(qEl&&qEl.value||'').toLowerCase().trim();
  // Keep original indices so selectDevice() still maps into STATE.deviceDb.
  let rows=STATE.deviceDb.map((d,i)=>({d,i}));
  if(q) rows=rows.filter(({d})=>(
    (d.model||'').toLowerCase().includes(q)||(d.cpu_platform||'').toLowerCase().includes(q)||
    (d.brand||'').toLowerCase().includes(q)||(d.device||'').toLowerCase().includes(q)||
    ('android '+d.android_version).includes(q)));
  if(!rows.length){ list.innerHTML='<div class="empty-state" style="padding:16px">No matching profiles</div>'; return; }
  list.innerHTML=rows.slice(0,300).map(({d,i})=>`
    <div class="device-option ${i===STATE.selectedIdx?'selected':''}" onclick="selectDevice(${i})">
      <div><div class="dev-name">${d.brand} · ${d.model}</div>
      <div class="dev-sub">Android ${d.android_version} · ${d.cpu_platform} · patch ${d.security_patch}</div></div>
      <span class="check">✓</span></div>`).join('')
    +(rows.length>300?`<div class="note">Showing first 300 of ${rows.length} — refine your search</div>`:'');
}
function selectDevice(i){STATE.selectedIdx=i;renderDeviceList();updateSelLabel();}
function updateSelLabel(){
  const d=STATE.deviceDb[STATE.selectedIdx];
  const el=document.getElementById('sel-device-label');
  el.textContent=d?d._ui_profile:'No device selected';
  el.style.color=d?'var(--text)':'var(--muted)';
}

/* ── Installed app picker ───────────────────────────────────────────────── */
async function loadInstalledApps(){
  const sys=document.getElementById('app-sys').checked;
  const cmd=sys?'pm list packages':'pm list packages -3';
  addLog('Loading installed apps…','ok');
  try{
    const out=await shell(`${cmd} 2>/dev/null`);
    if(!out||out.trim()==='DEMO_MODE'){
      STATE.installedApps=['com.example.learnzygisk','com.android.chrome','com.whatsapp','com.google.android.gms'];
    }else{
      STATE.installedApps=out.split('\n')
        .map(l=>l.replace(/^package:/,'').trim())
        .filter(Boolean).sort();
    }
    addLog(`Loaded ${STATE.installedApps.length} apps`,'ok');
    renderAppList();
  }catch(e){addLog('Could not list apps','fail');}
}
function filterApps(){ if(STATE.installedApps&&STATE.installedApps.length) renderAppList(); }
function renderAppList(){
  const list=document.getElementById('app-list');
  const q=(document.getElementById('app-search').value||'').toLowerCase();
  let apps=STATE.installedApps||[];
  if(q) apps=apps.filter(p=>p.toLowerCase().includes(q)||(APP_NAMES[p]||'').toLowerCase().includes(q));
  const shown=apps.slice(0,300);
  list.style.display='block';
  if(!shown.length){ list.innerHTML='<div class="empty-state">No matches</div>'; return; }
  const cur=document.getElementById('sel-app').value;
  list.innerHTML=shown.map(p=>`
    <div class="device-option ${p===cur?'selected':''}" onclick="selectInstalledApp('${p}')">
      <div><div class="dev-name">${APP_NAMES[p]||p}</div>
      <div class="dev-sub">${p}</div></div>
      <span class="check">✓</span></div>`).join('')
    +(apps.length>shown.length?`<div class="note">Showing first 300 — refine your search</div>`:'');
}
function selectInstalledApp(pkg){
  const sel=document.getElementById('sel-app');
  let opt=[...sel.options].find(o=>o.value===pkg);
  if(!opt){ opt=document.createElement('option'); opt.value=pkg; opt.textContent=APP_NAMES[pkg]||pkg; sel.appendChild(opt); }
  sel.value=pkg;
  renderAppList();
  addLog('Target set: '+(APP_NAMES[pkg]||pkg),'ok');
}

/* ── Inject / Active ────────────────────────────────────────────────────── */
// SoC vendor for ro.soc.manufacturer (chip maker, matches Kabir).
function socMfr(plat){plat=(plat||'').toLowerCase();
  if(plat.includes('exynos'))return'Samsung';
  if(plat.includes('tensor')||plat.includes('zuma')||plat.includes('gs101')||plat.includes('gs201'))return'Google';
  if(plat.includes('kirin'))return'HiSilicon';
  if(plat.includes('mt'))return'Mediatek';
  return'QTI';}
// KABIR MODEL: the .so no longer hooks property reads. Instead we set the REAL
// system properties globally with resetprop (run ON INJECT, i.e. after boot —
// safe, never at early boot which bootloops). Any app then reads spoofed props
// with nothing hooked, so anti-tamper can't detect it. Per-device identity
// (serial) is handled by Build reflection in the .so.
async function applyGetpropSpoof(d){
  if(!d) return;
  const av=d.android_version||'14', sdk=String(d.sdk_int||34), loc=d.locale||'en-US';
  const soc=socMfr(d.cpu_platform);
  const desc=`${d.product}-user ${av} ${d.build_id} ${d.incremental} release-keys`;
  const parts=['','system.','vendor.','odm.','product.','system_ext.','vendor_dlkm.','system_dlkm.','odm_dlkm.'];
  const set=[]; const P=(k,v)=>{ if(v!==undefined&&v!==null&&String(v)!=='') set.push([k,String(v).replace(/"/g,'')]); };
  parts.forEach(p=>P('ro.'+p+'build.fingerprint',d.fingerprint)); P('ro.bootimage.build.fingerprint',d.fingerprint);
  parts.forEach(p=>P('ro.'+p+'build.id',d.build_id)); P('ro.build.display.id',d.build_id);
  parts.forEach(p=>P('ro.'+p+'build.version.incremental',d.incremental));
  parts.forEach(p=>P('ro.'+p+'build.version.release',av));
  parts.forEach(p=>P('ro.'+p+'build.version.release_or_codename',av));
  parts.forEach(p=>P('ro.'+p+'build.version.sdk',sdk));
  P('ro.build.version.security_patch',d.security_patch); P('ro.vendor.build.security_patch',d.security_patch);
  P('ro.build.version.codename','REL');
  P('ro.build.version.base_os',d.fingerprint);
  if(d.build_date){
    parts.forEach(p=>P('ro.'+p+'build.date',d.build_date));
  }
  if(d.build_date_utc){
    parts.forEach(p=>P('ro.'+p+'build.date.utc',d.build_date_utc));
  }
  const prodParts=['','system.','vendor.','odm.','product.','system_ext.','vendor_dlkm.','system_dlkm.','odm_dlkm.'];
  prodParts.forEach(p=>P('ro.product.'+p+'model',d.model));
  P('ro.product.display',d.model);
  prodParts.forEach(p=>P('ro.product.'+p+'device',d.device));
  P('ro.product.board',d.board||d.cpu_platform);
  prodParts.forEach(p=>P('ro.product.'+p+'name',d.product));
  prodParts.forEach(p=>P('ro.product.'+p+'brand',d.brand));
  prodParts.forEach(p=>P('ro.product.'+p+'manufacturer',d.manufacturer));
  P('ro.build.description',desc); P('ro.build.flavor',`${d.product}-user`); P('ro.build.product',d.product);
  P('ro.hardware',d.hardware); P('ro.boot.hardware',d.hardware); P('ro.board.platform',d.cpu_platform);
  P('ro.product.cpu.abi',d.cpu_abi||'arm64-v8a');
  P('ro.product.cpu.abilist',d.cpu_abilist||'arm64-v8a,armeabi-v7a,armeabi'); P('ro.product.cpu.abilist64',d.cpu_abilist64||'arm64-v8a'); P('ro.product.cpu.abilist32',d.cpu_abilist32||'armeabi-v7a,armeabi');
  P('ro.vendor.product.cpu.abilist',d.cpu_abilist||'arm64-v8a,armeabi-v7a,armeabi'); P('ro.vendor.product.cpu.abilist64',d.cpu_abilist64||'arm64-v8a'); P('ro.vendor.product.cpu.abilist32',d.cpu_abilist32||'armeabi-v7a,armeabi');
  P('ro.baseband',d.radio); P('ro.boot.baseband',d.radio); P('gsm.version.baseband',d.radio);
  P('ro.product.locale',loc); P('persist.sys.locale',loc);
  P('ro.soc.manufacturer',d.soc_manufacturer||soc); P('ro.soc.model',d.soc_model||d.cpu_platform);
  P('ro.build.host',d.host||'android-build'); P('ro.build.user',d.user||'builder');
  P('ro.boot.vbmeta.digest',d.vbmeta_digest);
  P('ro.build.tags','release-keys'); P('ro.build.type','user');
  P('ro.bootloader',d.bootloader||'locked'); P('ro.boot.bootloader',d.bootloader||'locked');
  if(d.first_api_level){ P('ro.product.first_api_level',d.first_api_level); P('ro.board.first_api_level',d.first_api_level); }
  if(d.lcd_density) P('ro.sf.lcd_density',d.lcd_density);
  if(d.clientidbase) P('ro.com.google.clientidbase',d.clientidbase);
  if(d.clientidbase_ms) P('ro.com.google.clientidbase.ms',d.clientidbase_ms);
  if(d.clientidbase_vs) P('ro.com.google.clientidbase.vs',d.clientidbase_vs);
  if(!set.length) return;
  const cmd=set.map(([k,v])=>`resetprop -n "${k}" "${v}"`).join('; ')+'; true';
  try{ await shell(cmd); addLog('System props applied (resetprop)','ok'); }
  catch(e){ addLog('resetprop failed (needs root)','fail'); }
  // Persist so props survive a REBOOT. resetprop is RAM-only, so without this the
  // spoof reverts to the real device after boot until the user re-injects.
  // apply_props.sh re-reads this file on every boot (post boot_completed — safe).
  try{
    const body='# auto-generated on inject — re-applied every boot by apply_props.sh\n'
      + set.map(([k,v])=>`${k}=${v}`).join('\n') + '\n';
    const b64=btoa(unescape(encodeURIComponent(body)));
    await shell(`echo '${b64}' | base64 -d > "${BOOT_PROPS}.tmp" && chmod 0644 "${BOOT_PROPS}.tmp" && mv -f "${BOOT_PROPS}.tmp" "${BOOT_PROPS}" && chcon u:object_r:system_file:s0 "${BOOT_PROPS}" 2>/dev/null; true`);
    addLog('Boot-persist saved (survives reboot)','ok');
  }catch(e){ addLog('Boot-persist save failed','warn'); }
}
async function injectApp(){
  if(!STATE.licensed){
    addLog('Injection blocked — device not licensed','fail');
    showTab('license',document.getElementById('tab-license'));
    return;
  }
  const pkg=document.getElementById('sel-app').value;
  const d=STATE.deviceDb[STATE.selectedIdx];
  if(!d){addLog('Generate devices first','warn');return;}
  STATE.config.active_injections[pkg]={enabled:true,mode:'full',device_info:{...d}};
  try{
    const newAid=Array.from({length:16},()=>Math.floor(Math.random()*16).toString(16)).join('');
    let rst='';
    rst+=`settings put secure android_id "${newAid}"; `;
    rst+=`sed -i "/${pkg}/d" /data/system/users/0/settings_ssaid.xml 2>/dev/null; `;
    rst+=`rm -rf /data/user/0/${pkg}/cache/* /data/user_de/0/${pkg}/cache/* 2>/dev/null; `;
    rst+=`rm -f /data/user/0/${pkg}/shared_prefs/*.xml /data/user_de/0/${pkg}/shared_prefs/*.xml 2>/dev/null; `;
    rst+=`rm -f /data/user/0/${pkg}/databases/*.db /data/user_de/0/${pkg}/databases/*.db 2>/dev/null; `;
    await shell(rst);
  }catch(e){}
  await autoSave();
  await applyGetpropSpoof(d);
  renderActive();
  await shell(`am force-stop ${pkg}`).catch(()=>{});
  addLog(`Injected & Cleared → ${APP_NAMES[pkg]||pkg}`,'ok');
}
async function removeApp(pkg){
  delete STATE.config.active_injections[pkg];
  await autoSave();
  if(!Object.keys(STATE.config.active_injections).length){
    await shell(`rm -f "${BOOT_PROPS}"`).catch(()=>{});
  }
  renderActive();
  await shell(`am force-stop ${pkg}`).catch(()=>{});
  addLog(`Removed: ${APP_NAMES[pkg]||pkg}`,'warn');
}
function renderActive(){
  const el=document.getElementById('active-list');
  const items=Object.entries(STATE.config.active_injections||{});
  const stEl=document.getElementById('st-targets');
  if(stEl)stEl.textContent=items.length;
  if(!items.length){el.innerHTML='<div class="empty-state">No active injections</div>';return;}
  el.innerHTML=items.map(([pkg,data])=>`
    <div class="row">
      <div class="row-dot" style="background:${APP_COLORS[pkg]||'#555'}"></div>
      <div style="flex:1">
        <div class="row-title">${APP_NAMES[pkg]||pkg}</div>
        <div class="row-sub">${data.device_info?._ui_profile||'Active'}</div>
        <div class="row-sub" style="color:var(--faint)">${pkg}</div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="removeApp('${pkg}')">Remove</button>
    </div>`).join('');
}

/* ── Config save/load ───────────────────────────────────────────────────── */
async function autoSave(){
  setSaveStatus('saving');
  const str=JSON.stringify(STATE.config,null,2),temp=CONFIG+'.tmp';
  try{
    const b64=btoa(unescape(encodeURIComponent(str)));
    await shell(`mkdir -p ${MODDIR}; echo '${b64}' | base64 -d > "${temp}" && chmod 0644 "${temp}" && mv -f "${temp}" "${CONFIG}" && chcon u:object_r:system_file:s0 "${CONFIG}" 2>/dev/null || true`);
    JSON.parse(await shell(`cat "${CONFIG}" 2>/dev/null`));
    setSaveStatus('saved');setTimeout(()=>setSaveStatus(''),2000);
  }catch(e){setSaveStatus('error');addLog('Save failed','fail');}
}
function setSaveStatus(s){
  const el=document.getElementById('save-indicator');if(!el)return;
  if(s==='saving'){el.style.color='var(--warn)';el.textContent='Saving…';}
  else if(s==='saved'){el.style.color='var(--ok)';el.textContent='Saved ✓';}
  else if(s==='error'){el.style.color='var(--danger)';el.textContent='Error';}
  else el.textContent='';
}
async function loadConfig(){
  try{
    const data=await shell(`cat "${CONFIG}" 2>/dev/null || echo '{}'`);
    const parsed=JSON.parse(data&&data!=='DEMO_MODE'?data:'{}');
    STATE.config=parsed;
    if(!STATE.config.active_injections||typeof STATE.config.active_injections!=='object')STATE.config.active_injections={};
    if(!STATE.config.cpu_spoof)STATE.config.cpu_spoof={blacklist:[],cpu_only_packages:[]};
    renderActive();addLog('Config loaded','ok');
  }catch(e){renderActive();addLog('Config load failed','fail');}
}
// Backup/restore the injection config to a folder OUTSIDE the module dir, so it
// survives a module reflash/reinstall (the module dir is wiped on update).
const BACKUP_DIR='/data/adb/hmodzero_backup';
async function exportConfig(){
  try{
    const out=await shell(`mkdir -p "${BACKUP_DIR}" && cp -f "${CONFIG}" "${BACKUP_DIR}/config.json" && echo OK || echo FAIL`);
    if(out&&out.trim()==='DEMO_MODE'){ addLog('Backup unavailable in demo','warn'); return; }
    if((out||'').includes('OK')) addLog('Backup saved → '+BACKUP_DIR+' (survives reflash)','ok');
    else addLog('Backup failed — is config saved yet?','fail');
  }catch(e){ addLog('Backup failed','fail'); }
}
async function importConfig(){
  const ask='Restore config from the last backup? This replaces your current injections.';
  if(typeof confirm==='function' && !confirm(ask)) return;
  try{
    const chk=(await shell(`[ -f "${BACKUP_DIR}/config.json" ] && echo YES || echo NO`)).trim();
    if(chk==='DEMO_MODE'){ addLog('Restore unavailable in demo','warn'); return; }
    if(chk!=='YES'){ addLog('No backup found — make a Backup first','warn'); return; }
    // Validate the backup parses before overwriting the live config.
    const raw=await shell(`cat "${BACKUP_DIR}/config.json" 2>/dev/null`);
    JSON.parse(raw);
    await shell(`cp -f "${BACKUP_DIR}/config.json" "${CONFIG}" && chmod 0644 "${CONFIG}" && chcon u:object_r:system_file:s0 "${CONFIG}" 2>/dev/null || true`);
    await loadConfig();
    addLog('Config restored from backup','ok');
  }catch(e){ addLog('Restore failed — backup unreadable or invalid','fail'); }
}

/* ── Status ─────────────────────────────────────────────────────────────── */
async function refreshStatus(){
  try{
    const serial=(await shell(`cat "${SERIAL_PATH}" 2>/dev/null||true`)).trim();
    document.getElementById('st-serial').textContent=serial&&serial!=='DEMO_MODE'?serial:'Unavailable';
    await shell(`sh "${SVC_V2}" --once 2>/dev/null||true`);
    const raw=await shell(`cat "${STATUS_PATH}" 2>/dev/null||echo '{}'`);
    const data=JSON.parse(raw&&raw!=='DEMO_MODE'?raw:'{}');
    document.getElementById('st-status').textContent=(data.status||'unknown').toUpperCase();
    document.getElementById('st-lastcheck').textContent=data.lastCheck?new Date(Number(data.lastCheck)*1000).toLocaleString():'—';
    document.getElementById('st-message').textContent=data.message||'—';
    addLog('Status refreshed','ok');
  }catch(e){addLog('Status refresh failed','fail');}
}

/* ── Log ────────────────────────────────────────────────────────────────── */
function addLog(msg,type='ok'){
  const area=document.getElementById('log-area');
  const empty=area.querySelector('.log-empty');if(empty)empty.remove();
  const t=new Date().toLocaleTimeString();
  const row=document.createElement('div');row.className='log-row';
  row.innerHTML=`<span class="log-time">${t}</span><span class="log-badge log-${type}">${type==='ok'?'OK':type==='warn'?'WARN':'FAIL'}</span><span class="log-msg"></span>`;
  row.querySelector('.log-msg').textContent=String(msg);
  area.appendChild(row);
  while(area.children.length>200)area.removeChild(area.firstChild);
  area.scrollTop=area.scrollHeight;
}
function clearLog(){document.getElementById('log-area').innerHTML='<div class="log-empty">Tap Start to stream logcat</div>';STATE.logSeen.clear();}
async function toggleLog(){
  const btn=document.getElementById('btn-log');
  if(!STATE.logRunning){
    STATE.logRunning=true;btn.textContent='Stop';btn.style.background='var(--danger)';
    addLog('Monitoring started','ok');
    const tick=async()=>{
      if(!STATE.logRunning)return;
      try{
        const data=await shell('logcat -d -v time -s HMODZero 2>/dev/null | tail -80');
        if(data&&data.trim()&&data!=='DEMO_MODE'){
          data.split('\n').filter(l=>l.trim()).forEach(line=>{
            const key=line.trim();if(STATE.logSeen.has(key))return;
            STATE.logSeen.add(key);if(STATE.logSeen.size>500)STATE.logSeen=new Set([...STATE.logSeen].slice(-250));
            const msg=line.replace(/.*HMODZero:\s*/,'').trim();if(!msg)return;
            const lower=msg.toLowerCase();
            const type=lower.includes('fail')||lower.includes('error')?'fail':lower.includes('warn')?'warn':'ok';
            addLog(msg,type);
          });
        }
      }catch(e){addLog('Log read failed','fail');}
      STATE.logTimer=setTimeout(tick,2000);
    };tick();
  }else{
    STATE.logRunning=false;clearTimeout(STATE.logTimer);
    btn.textContent='Start';btn.style.background='var(--primary)';
    addLog('Monitoring stopped','warn');
  }
}

/* ── License ────────────────────────────────────────────────────────────── */
// Verification runs in the native `licverify` binary (same compiled code as
// the .so). The WebUI never sees the secret — it only reads OK / BAD.
async function checkLicense(){
  let serial='—', licensed=false, demo=false;
  try{
    const out=await shell(`"${LIC_BIN}" 2>/dev/null; true`);
    if(!out||out.trim()==='DEMO_MODE'){demo=true;serial='DEMO-SERIAL';licensed=true;}
    else{
      out.split('\n').forEach(l=>{
        const i=l.indexOf('=');if(i<0)return;
        const k=l.slice(0,i).trim(),v=l.slice(i+1).trim();
        if(k==='SERIAL')serial=v||'Unavailable';
        if(k==='LICENSED')licensed=(v==='1');
      });
    }
  }catch(e){/* binary missing / not built */}
  STATE.licensed=licensed;STATE.serial=serial;
  applyLicenseUI(demo);
  updateExpiry(demo);
  return licensed;
}

/* ── Expiry countdown ───────────────────────────────────────────────────── */
async function updateExpiry(demo){
  const card=document.getElementById('lic-exp-card');
  if(!STATE.licensed){ if(card)card.style.display='none'; stopCountdown(); return; }
  if(demo){ STATE.licexp=Math.floor(Date.now()/1000)+30*86400; STATE.grantExpiry=Math.floor(Date.now()/1000)+6*3600; STATE.grantIssued=Math.floor(Date.now()/1000); }
  else{
    try{
      const raw=await shell(`cat "${GRANT_PATH}" 2>/dev/null||echo '{}'`);
      const g=JSON.parse(raw&&raw!=='DEMO_MODE'?raw:'{}');
      STATE.grantExpiry=Number(g.expiry)||0;
      STATE.licexp=Number(g.licexp)||0;
      STATE.grantIssued=Number(g.issued)||0;
    }catch(e){ STATE.grantExpiry=0;STATE.licexp=0;STATE.grantIssued=0; }
  }
  if(card)card.style.display='block';
  startCountdown();
}
function stopCountdown(){ if(STATE.cdTimer){clearInterval(STATE.cdTimer);STATE.cdTimer=null;} }
function startCountdown(){ stopCountdown(); tickCountdown(); STATE.cdTimer=setInterval(tickCountdown,1000); }
function fmtRemain(sec){
  if(sec<=0)return 'Expired';
  const d=Math.floor(sec/86400),h=Math.floor(sec%86400/3600),m=Math.floor(sec%3600/60),s=Math.floor(sec%60);
  if(d>0)return `${d}d ${h}h ${m}m`;
  if(h>0)return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
function tickCountdown(){
  const now=Math.floor(Date.now()/1000);
  const big=document.getElementById('lic-exp-big');
  const dateEl=document.getElementById('lic-exp-date');
  const nextEl=document.getElementById('lic-exp-next');
  const fill=document.getElementById('lic-exp-fill');
  const card=document.getElementById('lic-exp-card');
  if(STATE.licexp>0){
    const rem=STATE.licexp-now;
    if(big)big.textContent=fmtRemain(rem);
    if(dateEl)dateEl.textContent=new Date(STATE.licexp*1000).toLocaleString();
    if(card)card.classList.toggle('warn', rem>0 && rem<3*86400);
  }else{
    if(big)big.textContent='Never';
    if(dateEl)dateEl.textContent='No expiry';
    if(card)card.classList.remove('warn');
  }
  // progress bar = offline grace remaining until next required online check
  if(fill){
    const total=Math.max(1,STATE.grantExpiry-STATE.grantIssued);
    const left=STATE.grantExpiry-now;
    fill.style.width=Math.max(0,Math.min(1,left/total))*100+'%';
  }
  if(nextEl){
    const gr=STATE.grantExpiry-now;
    nextEl.textContent=gr>0?fmtRemain(gr):'refreshing…';
  }
}
function applyLicenseUI(demo){
  const lic=STATE.licensed;
  // Nav badge
  const badge=document.getElementById('lic-badge');
  if(badge){
    badge.className='badge'+(lic?'':' locked');
    badge.innerHTML=(lic?'●&nbsp;'+(demo?'DEMO':'LICENSED'):'●&nbsp;UNLICENSED');
  }
  // Warning banner
  const banner=document.getElementById('lic-banner');
  if(banner)banner.style.display=lic?'none':'flex';
  // License panel
  const dot=document.getElementById('lic-dot');
  const title=document.getElementById('lic-status-title');
  const sub=document.getElementById('lic-status-sub');
  if(dot)dot.className='lic-status-dot '+(lic?'ok':'bad');
  if(title)title.textContent=lic?(demo?'Demo Mode':'Premium Active'):'Not Activated';
  if(sub)sub.textContent=lic
    ?(demo?'WebUI preview — flash on a device to verify':'Injection is active on this device')
    :'Send your serial to the admin to be registered, then Refresh';
  const sEl=document.getElementById('lic-serial');if(sEl)sEl.textContent=STATE.serial;
  // Gate the inject button (soft gate — real gate is the .so)
  const inj=document.getElementById('btn-inject');
  if(inj&&!lic){inj.disabled=true;inj.textContent='Activate to inject';}
}
async function activateLicense(){
  const msg=document.getElementById('lic-msg');
  const btn=document.getElementById('btn-activate');
  const setMsg=(t,c)=>{if(msg){msg.textContent=t;msg.className='lic-msg '+(c||'info');}};
  btn.disabled=true;btn.textContent='Checking…';
  setMsg('Contacting activation server…','info');
  let map={};
  try{
    // Serial-based activation runs in the native CLI (crypto + network) — no key.
    // On a definitive denial (revoked/expired/not-registered) the CLI already
    // deletes the cached grant; on a network error it keeps it (offline grace).
    const out=await shell(`"${LIC_BIN}" --activate 2>/dev/null; true`);
    if(!out||out.trim()==='DEMO_MODE'){setMsg('Demo mode — needs a real device','info');btn.disabled=false;btn.textContent='Refresh Online Status';return;}
    out.split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)map[l.slice(0,i).trim()]=l.slice(i+1).trim();});
  }catch(e){setMsg('Could not run activation','bad');btn.disabled=false;btn.textContent='Refresh Online Status';return;}

  // Relabel the grant cache (if written) so the Zygisk .so can read it.
  await shell(`chcon u:object_r:system_file:s0 "${MODDIR}/license.grant" "${MODDIR}/.lic_hb" 2>/dev/null || true`).catch(()=>{});

  // Re-read the real (offline) state after the server round-trip.
  const lic = await checkLicense();
  if(lic){
    setMsg('✓ '+(map.MSG||'Activated'),'ok');addLog('Activated online','ok');
  }else{
    setMsg('✗ '+(map.MSG||'Not activated — ask admin to register your serial'),'bad');
    addLog('Not licensed: '+(map.MSG||''),'fail');
    // IMMEDIATE revoke: the grant is gone → force-stop injected targets so they
    // respawn without hooks right now (don't wait for the 30-min service tick).
    const pkgs=Object.keys((STATE.config&&STATE.config.active_injections)||{});
    for(const p of pkgs){ await shell(`am force-stop ${p}`).catch(()=>{}); }
    if(pkgs.length) addLog('Injection stopped on '+pkgs.length+' target(s)','warn');
  }
  btn.disabled=false;btn.textContent='Refresh Online Status';
}
function copySerial(){
  const s=STATE.serial||'';
  try{navigator.clipboard&&navigator.clipboard.writeText(s);}catch(e){}
  shell(`echo -n '${s.replace(/'/g,"")}' | { command -v termux-clipboard-set >/dev/null 2>&1 && termux-clipboard-set; } 2>/dev/null||true`).catch(()=>{});
  addLog('Serial copied','ok');
}
// Open WhatsApp to H-MODS with the device serial pre-filled, so the customer
// just taps Send and the admin can register it.
const HMODS_WA='923293003848';
function sendSerialWhatsApp(){
  const s=(STATE.serial||'').trim();
  if(!s||s==='—'||s==='Unavailable'){ addLog('Serial not available yet','warn'); }
  const text=encodeURIComponent(
    'HMOD-Zero activation request\nMy device serial: '+(s||'(unavailable)')+'\nPlease register my device.');
  openLink(`https://wa.me/${HMODS_WA}?text=${text}`);
  addLog('Opening WhatsApp to H-MODS','ok');
}

/* ── Tabs / Modals ──────────────────────────────────────────────────────── */
function showTab(id,btn){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  document.getElementById('panel-'+id).classList.add('active');btn.classList.add('active');
}
function openModal(id){
  document.getElementById(id).classList.add('open');
  if(id==='home-modal')loadDeviceInfo();
  if(id==='status-modal')refreshStatus();
}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function openLink(url){shell(`am start -a android.intent.action.VIEW -d "${url}"`).catch(()=>{});}

/* ── Device info + modules ──────────────────────────────────────────────── */
async function loadDeviceInfo(){
  const set=(id,v)=>{const el=document.getElementById(id);if(el&&v)el.textContent=v;};
  try{
    const out=await shell(
      'echo "MODEL=$(getprop ro.product.model)"; echo "KERNEL=$(uname -r)"; '+
      'echo "SDK=$(getprop ro.build.version.sdk)"; echo "REL=$(getprop ro.build.version.release)"; '+
      `Z=""; for m in zygisksu zygisk_next rezygisk; do if [ -d /data/adb/modules/$m ]&&[ ! -f /data/adb/modules/$m/disable ]; then nm=$(grep "^name=" /data/adb/modules/$m/module.prop 2>/dev/null|cut -d= -f2); vv=$(grep "^version=" /data/adb/modules/$m/module.prop 2>/dev/null|cut -d= -f2); Z="$nm $vv"; break; fi; done; echo "ZYGISK=$Z"; `+
      `MV=$(grep "^version=" /data/adb/modules/${MODID}/module.prop 2>/dev/null|cut -d= -f2); echo "MODULE=$MV"`);
    if(!out||out.trim()==='DEMO_MODE'){set('di-model','Demo Device');set('di-kernel','5.10.0');set('di-sdk','34 (Android 14)');set('di-zygisk','ZygiskNext');set('di-module','v1.0');}
    else{
      const map={};out.split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)map[l.slice(0,i)]=l.slice(i+1).trim();});
      set('di-model',map.MODEL||'Unknown');set('di-kernel',map.KERNEL||'Unknown');
      set('di-sdk',(map.SDK||'?')+(map.REL?` (Android ${map.REL})`:''));
      set('di-zygisk',map.ZYGISK&&map.ZYGISK.trim()?map.ZYGISK:'Not detected');
      set('di-module',map.MODULE||'v1.0');
    }
  }catch(e){set('di-module','read failed');}
  loadModules();
}
async function loadModules(){
  const box=document.getElementById('di-modules'),cnt=document.getElementById('di-modcount');if(!box)return;
  const render=mods=>{cnt.textContent=mods.length+' total';
    box.innerHTML=mods.map(m=>{const on=m.st==='on';
      return`<div class="mod-item"><span class="mod-dot ${on?'on':'off'}"></span><div class="mod-info"><div class="mod-name">${m.name}</div><div class="mod-ver">${m.ver}</div></div><span class="mod-badge ${on?'on':'off'}">${on?'ON':'OFF'}</span></div>`;}).join('');};
  try{
    const out=await shell('for d in /data/adb/modules/*/; do [ -d "$d" ]||continue; id=$(basename "$d"); nm=$(grep "^name=" "$d/module.prop" 2>/dev/null|cut -d= -f2); vr=$(grep "^version=" "$d/module.prop" 2>/dev/null|cut -d= -f2); [ -z "$nm" ]&&nm="$id"; [ -z "$vr" ]&&vr="-"; [ -f "$d/disable" ]&&s="off"||s="on"; echo "$s|$nm|$vr"; done');
    if(!out||out.trim()==='DEMO_MODE'){render([{st:'on',name:'HMOD-Zero',ver:'v1.0'},{st:'on',name:'ZygiskNext',ver:'v1.2.4'},{st:'on',name:'Shamiko',ver:'v1.2.1'}]);return;}
    const mods=out.split('\n').filter(l=>l.includes('|')).map(l=>{const[s,nm,vr]=l.split('|');return{st:s,name:nm,ver:vr};});
    if(mods.length)render(mods);else box.innerHTML='<div class="empty-state" style="padding:16px">No modules found</div>';
  }catch(e){box.innerHTML='<div class="empty-state" style="padding:16px">Read failed</div>';}
}

/* ── Theme ──────────────────────────────────────────────────────────────── */
function applySwatch(h){const sw=document.getElementById('hue-swatch');if(sw)sw.style.background=`hsl(${h},78%,53%)`;}
function setHue(h){document.documentElement.style.setProperty('--hue',h);applySwatch(h);shell(`echo ${h}>"${HUE_FILE}" 2>/dev/null`).catch(()=>{});try{localStorage.setItem('hmods_hue',h);}catch(e){}}
function setSat(s){document.documentElement.style.setProperty('--sat',s+'%');shell(`echo ${s}>"${SAT_FILE}" 2>/dev/null`).catch(()=>{});try{localStorage.setItem('hmods_sat',s);}catch(e){}}
function pickHue(h){setHue(h);const sl=document.getElementById('home-hue');if(sl)sl.value=h;}
async function loadTheme(){
  let h=null,s=null;
  try{h=localStorage.getItem('hmods_hue');s=localStorage.getItem('hmods_sat');}catch(e){}
  try{const f=(await shell(`cat "${HUE_FILE}" 2>/dev/null||echo ""`)).trim();if(f&&f!=='DEMO_MODE'&&!isNaN(f))h=f;}catch(e){}
  try{const f=(await shell(`cat "${SAT_FILE}" 2>/dev/null||echo ""`)).trim();if(f&&f!=='DEMO_MODE'&&!isNaN(f))s=f;}catch(e){}
  if(h&&!isNaN(h)){document.documentElement.style.setProperty('--hue',h);const sl=document.getElementById('home-hue');if(sl)sl.value=h;applySwatch(h);}
  if(s&&!isNaN(s)){document.documentElement.style.setProperty('--sat',s+'%');const sl=document.getElementById('home-sat');if(sl)sl.value=s;}
}

async function detectPhoneOs(){
  try{
    const out=await shell('echo "SDK=$(getprop ro.build.version.sdk)"; echo "REL=$(getprop ro.build.version.release)"');
    if(out&&out.trim()!=='DEMO_MODE'){
      const map={};out.split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)map[l.slice(0,i)]=l.slice(i+1).trim();});
      STATE.phoneSdk=parseInt(map.SDK)||34;STATE.phoneOs=map.REL||'14';
      addLog(`Phone: Android ${STATE.phoneOs} (SDK ${STATE.phoneSdk})`,'ok');
    }
  }catch(e){}
}

// Read the real module version from module.prop so the WebUI never shows a stale
// hardcoded version after a bump.
async function loadVersion(){
  try{
    const out=await shell(`cat "${MODDIR}/module.prop" 2>/dev/null || true`);
    const m=out.match(/^\s*version\s*=\s*(.+)\s*$/m);
    if(m&&m[1]){
      const v=m[1].trim();
      const pill=document.getElementById('nav-ver'); if(pill)pill.textContent=v;
      const sub=document.getElementById('nav-ver-sub'); if(sub)sub.textContent=`${v} · Premium`;
    }
  }catch(e){/* keep hardcoded fallback */}
}
document.addEventListener('DOMContentLoaded',()=>{
  loadConfig();loadTheme();detectPhoneOs();checkLicense();loadVersion();
});
