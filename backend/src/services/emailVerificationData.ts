// Comprehensive static data for email verification engine.
// Lists are intentionally large but kept in a single module for fast Set lookups.

export interface MxProviderInfo {
  name: string;
  type: 'business' | 'free' | 'hosting' | 'custom';
  catchAllLikelihood: 'low' | 'medium' | 'high';
  reputationBonus: number;
}

export const FREE_EMAIL_PROVIDERS = new Set<string>([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.fr', 'yahoo.de', 'yahoo.es',
  'yahoo.it', 'yahoo.com.br', 'yahoo.com.mx', 'yahoo.ca', 'yahoo.com.au',
  'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.es',
  'hotmail.it', 'hotmail.com.br', 'hotmail.com.ar',
  'outlook.com', 'outlook.fr', 'outlook.de', 'outlook.es', 'outlook.it',
  'outlook.com.br', 'outlook.in', 'outlook.jp',
  'live.com', 'live.co.uk', 'live.fr', 'live.de', 'live.it', 'live.ca',
  'msn.com', 'passport.com',
  'aol.com', 'aol.co.uk', 'aol.de', 'aol.fr',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me', 'pm.me', 'protonmail.ch',
  'tutanota.com', 'tutanota.de', 'tutamail.com', 'tuta.io',
  'zoho.com', 'zohomail.com', 'zoho.in', 'zoho.eu',
  'mail.com', 'email.com', 'usa.com', 'europe.com',
  'gmx.com', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 'gmx.fr', 'gmx.us',
  'yandex.com', 'yandex.ru', 'yandex.ua', 'ya.ru',
  'mail.ru', 'inbox.ru', 'list.ru', 'bk.ru',
  'rambler.ru',
  'fastmail.com', 'fastmail.fm',
  'hushmail.com', 'lycos.com', 'rediffmail.com',
  'qq.com', '163.com', '126.com', 'sina.com', 'sina.cn',
  'naver.com', 'daum.net', 'hanmail.net',
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net',
  'cox.net', 'charter.net', 'earthlink.net', 'optonline.net',
  'roadrunner.com', 'bellsouth.net', 'frontier.com',
  'btinternet.com', 'virginmedia.com', 'sky.com', 'talktalk.net',
  'orange.fr', 'free.fr', 'sfr.fr', 'wanadoo.fr', 'laposte.net', 'neuf.fr',
  'web.de', 't-online.de', 'freenet.de',
  'libero.it', 'tiscali.it', 'virgilio.it', 'alice.it',
  'terra.com.br', 'uol.com.br', 'bol.com.br', 'ig.com.br',
  'rogers.com', 'shaw.ca', 'sympatico.ca', 'telus.net',
  'bigpond.com', 'bigpond.net.au',
]);

export const ROLE_ACCOUNT_PREFIXES = new Set<string>([
  'info', 'contact', 'hello', 'hi', 'support', 'help', 'helpdesk',
  'sales', 'marketing', 'admin', 'administrator', 'webmaster', 'postmaster',
  'hostmaster', 'abuse', 'spam', 'security', 'privacy', 'compliance', 'legal',
  'hr', 'jobs', 'careers', 'recruiting', 'recruitment', 'billing', 'accounts',
  'accounting', 'finance', 'invoicing', 'orders', 'order', 'enquiries',
  'inquiries', 'enquiry', 'inquiry', 'feedback', 'newsletter', 'subscribe',
  'unsubscribe', 'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'mailer-daemon', 'mailerdaemon', 'bounce', 'bounces', 'returns', 'undelivered',
  'team', 'staff', 'office', 'reception', 'frontdesk',
  'customerservice', 'customer-service', 'customersupport', 'customer-support',
  'service', 'services', 'press', 'media', 'pr', 'communications',
  'partners', 'partnership', 'partnerships', 'business', 'biz',
  'general', 'main', 'mail', 'email', 'website', 'web', 'all', 'everyone',
  'group', 'department', 'dept', 'manager', 'owner', 'ceo', 'cto', 'cfo',
]);

export const DISPOSABLE_PATTERNS: RegExp[] = [
  /^temp[-_.]?mail/i,
  /^trash[-_.]?mail/i,
  /^fake[-_.]?mail/i,
  /^throw[-_.]?away/i,
  /^disposable/i,
  /^\d+\s*minute/i,
  /mailinator/i,
  /guerrilla/i,
  /yopmail/i,
  /^getairmail/i,
  /sharklasers/i,
  /trashmail/i,
];

export const DISPOSABLE_DOMAINS = new Set<string>([
  '0-mail.com', '0815.ru', '0clickemail.com', '0wnd.net', '0wnd.org',
  '10mail.org', '10minutemail.com', '10minutemail.net', '10minutemail.de',
  '10minutemail.us', '10minutemail.co.uk', '10minutemail.co.za',
  '20mail.it', '20minutemail.com', '24hourmail.com', '2prong.com',
  '30minutemail.com', '33mail.com', '3d-painting.com', '4warding.com',
  '4warding.net', '4warding.org', '60minutemail.com', '675hosting.com',
  'a-bc.net', 'agedmail.com', 'aircraftmail.com', 'ajaxapp.net',
  'amilegit.com', 'anappthat.com', 'ano-mail.net', 'anonbox.net',
  'anonmails.de', 'anonymbox.com', 'antichef.com', 'antichef.net',
  'antispam.de', 'antispammail.de', 'armyspy.com', 'artman-conception.com',
  'azmeil.tk', 'baxomale.ht.cx', 'beefmilk.com', 'bigprofessor.so',
  'binkmail.com', 'bio-muesli.net', 'bobmail.info', 'bofthew.com',
  'bootybay.de', 'boun.cr', 'bouncr.com', 'breakthru.com', 'brefmail.com',
  'bsnow.net', 'bspamfree.org', 'bugmenot.com', 'bumpymail.com',
  'burnermail.io', 'burstmail.info', 'buyusedlibrarybooks.org',
  'casualdx.com', 'cek.pm', 'centermail.com', 'centermail.net',
  'chammy.info', 'childsavetrust.org', 'chogmail.com', 'choicemail1.com',
  'clixser.com', 'cmail.club', 'cmail.net', 'cmail.org', 'coldemail.info',
  'compareshippingrates.org', 'consumerriot.com', 'cool.fr.nf',
  'correo.blogos.net', 'cosmorph.com', 'courriel.fr.nf', 'courrieltemporaire.com',
  'crapmail.org', 'cubiclink.com', 'curryworld.de', 'cust.in', 'cuvox.de',
  'd3p.dk', 'dacoolest.com', 'dandikmail.com', 'dayrep.com', 'dcemail.com',
  'deadaddress.com', 'deadspam.com', 'delikkt.de', 'despam.it',
  'despammed.com', 'devnullmail.com', 'dfgh.net', 'digitalsanctuary.com',
  'dingbone.com', 'discard.email', 'discardmail.com', 'discardmail.de',
  'disposableaddress.com', 'disposableemailaddresses.com', 'disposableinbox.com',
  'dispose.it', 'dispostable.com', 'dodgeit.com', 'dodgit.com', 'dodgit.org',
  'donemail.ru', 'dontreg.com', 'dontsendmespam.de', 'drdrb.net', 'dump-email.info',
  'dumpandjunk.com', 'dumpyemail.com', 'duskmail.com', 'e4ward.com', 'easytrashmail.com',
  'einrot.com', 'einrot.de', 'eintagsmail.de', 'emailgo.de', 'emailias.com',
  'emailigo.de', 'emailinfive.com', 'emailisvalid.com', 'emaillime.com',
  'emailmiser.com', 'emailo.pro', 'emailondeck.com', 'emailproxsy.com',
  'emails.ga', 'emailsensei.com', 'emailtemporanee.com', 'emailtemporanee.net',
]);

const DISPOSABLE_BATCH_2 = [
  'emailto.de', 'emailwarden.com', 'emailx.at.hm', 'emailxfer.com', 'emailz.ml',
  'emeil.in', 'emeil.ir', 'emz.net', 'enterto.com', 'ephemail.net',
  'eyepaste.com', 'fake-box.com', 'fake-mail.cf', 'fake-mail.ga', 'fake-mail.ml',
  'fakeinbox.com', 'fakeinformation.com', 'fakemail.fr', 'fakemailgenerator.com',
  'fakemailz.com', 'fammix.com', 'fansworldwide.de', 'fantasymail.de',
  'fastacura.com', 'fastchevy.com', 'fastchrysler.com', 'fastkawasaki.com',
  'fastmazda.com', 'fastmitsubishi.com', 'fastnissan.com', 'fastsubaru.com',
  'fastsuzuki.com', 'fasttoyota.com', 'fastyamaha.com', 'filzmail.com',
  'fizmail.com', 'fleckens.hu', 'flemail.ru', 'flowu.com', 'fly-ts.de',
  'flyspam.com', 'footard.com', 'forgetmail.com', 'fr33mail.info', 'frapmail.com',
  'freeletter.me', 'freemail.ms', 'friendlymail.co.uk', 'fux0ringduh.com',
  'garliclife.com', 'get-mail.ml', 'get-mail.tk', 'get1mail.com', 'get2mail.fr',
  'getairmail.com', 'getmails.eu', 'getonemail.com', 'getonemail.net',
  'ghosttexter.de', 'giantmail.de', 'girlsundertheinfluence.com', 'gishpuppy.com',
  'gmial.com', 'goemailgo.com', 'gotmail.net', 'gotmail.org', 'gotti.otherinbox.com',
  'great-host.in', 'greggamel.com', 'greggamel.net', 'gregorsky.zone', 'grish.de',
  'grr.la', 'gsrv.co.uk', 'guerillamail.biz', 'guerillamail.com', 'guerillamail.de',
  'guerillamail.net', 'guerillamail.org', 'guerillamailblock.com', 'guerrillamail.biz',
  'guerrillamail.com', 'guerrillamail.de', 'guerrillamail.info', 'guerrillamail.net',
  'guerrillamail.org', 'guerrillamailblock.com', 'gustr.com', 'h.mintemail.com',
  'h8s.org', 'hacccc.com', 'haltospam.com', 'harakirimail.com', 'hartbot.de',
  'hat-geld.de', 'hatespam.org', 'herp.in', 'hidemail.de', 'hidzz.com',
  'hmamail.com', 'hochsitze.com', 'hopemail.biz', 'hot-mail.cf', 'hot-mail.ga',
  'hot-mail.gq', 'hot-mail.ml', 'hot-mail.tk', 'hotpop.com', 'hulapla.de',
  'iaoss.com', 'ieatspam.eu', 'ieatspam.info', 'ieh-mail.de', 'ihazspam.ca',
  'illistnoise.com', 'imails.info', 'imgof.com', 'imgv.de', 'imstations.com',
  'inbax.tk', 'inbound.plus', 'inbox.si', 'inboxalias.com', 'inboxbear.com',
  'inboxdesign.me', 'inboxed.im', 'inboxed.pw', 'incognitomail.com', 'incognitomail.net',
  'incognitomail.org', 'ineec.net', 'infest.org', 'inkscreen.com', 'insorg-mail.info',
  'instant-mail.de', 'iozak.com', 'ipoo.org', 'irish2me.com', 'iwi.net',
  'jetable.com', 'jetable.fr.nf', 'jetable.net', 'jetable.org', 'jnxjn.com',
  'jourrapide.com', 'jsrsolutions.com', 'junk1e.com', 'kasmail.com', 'kaspop.com',
  'keepmymail.com', 'killmail.com', 'killmail.net', 'kir.ch.tc', 'klassmaster.com',
  'klassmaster.net', 'klzlk.com', 'koszmail.pl', 'kulturbetrieb.info', 'kurzepost.de',
  'l33r.eu', 'labetteraverouge.at', 'lackmail.net', 'lags.us', 'landmail.co',
  'lawlita.com', 'letthemeatspam.com', 'lhsdv.com', 'lifebyfood.com', 'link2mail.net',
  'litedrop.com', 'lol.ovpn.to', 'lolfreak.net', 'lookugly.com', 'lortemail.dk',
  'lr78.com', 'lroid.com', 'lukop.dk', 'm21.cc', 'mail-filter.com',
  'mail-temporaire.fr', 'mail.by', 'mail.mezimages.net', 'mail.zp.ua', 'mail1a.de',
  'mail21.cc', 'mail2rss.org', 'mail333.com', 'mail4trash.com', 'mail707.com',
  'mailbidon.com', 'mailbiz.biz', 'mailblocks.com', 'mailbucket.org', 'mailcat.biz',
  'mailcatch.com', 'mailde.de', 'mailde.info', 'maileater.com', 'maileimer.de',
  'mailexpire.com', 'mailfa.tk', 'mailforspam.com', 'mailfreeonline.com',
  'mailguard.me', 'mailimate.com', 'mailin8r.com', 'mailinater.com', 'mailinator.com',
  'mailinator.net', 'mailinator.org', 'mailinator.us', 'mailinator2.com',
];
DISPOSABLE_BATCH_2.forEach((d) => DISPOSABLE_DOMAINS.add(d));

const DISPOSABLE_BATCH_3 = [
  'mailincubator.com', 'mailismagic.com', 'mailmate.com', 'mailme.lv', 'mailme24.com',
  'mailmetrash.com', 'mailmoat.com', 'mailms.com', 'mailnator.com', 'mailnesia.com',
  'mailnull.com', 'mailorg.org', 'mailpick.biz', 'mailrock.biz', 'mailscrap.com',
  'mailshell.com', 'mailsiphon.com', 'mailslapping.com', 'mailspeed.ru', 'mailtemp.info',
  'mailtome.de', 'mailtothis.com', 'mailtrash.net', 'mailtv.net', 'mailtv.tv',
  'mailzilla.com', 'mailzilla.org', 'makemetheking.com', 'manifestgenerator.com',
  'manybrain.com', 'mbx.cc', 'mega.zik.dj', 'meinspamschutz.de', 'meltmail.com',
  'messagebeamer.de', 'mezimages.net', 'mierdamail.com', 'ministry-of-silly-walks.de',
  'mintemail.com', 'misterpinball.de', 'moakt.com', 'mobi.web.id', 'moburl.com',
  'monemail.fr.nf', 'monmail.fr.nf', 'monumentmail.com', 'msa.minsmail.com',
  'mt2009.com', 'mt2014.com', 'mx0.wwwnew.eu', 'my10minutemail.com', 'mycard.net.ua',
  'mycleaninbox.net', 'myemailboxy.com', 'mymail-in.net', 'mymailoasis.com',
  'mynetstore.de', 'mypartyclip.de', 'mypoubelle.fr', 'mysamp.de', 'myspaceinc.com',
  'myspaceinc.net', 'myspaceinc.org', 'myspacepimpedup.com', 'myspamless.com',
  'mytemp.email', 'mytempemail.com', 'mytempmail.com', 'mytrashmail.com', 'nabuma.com',
  'neomailbox.com', 'nepwk.com', 'nervmich.net', 'nervtmich.net', 'netmails.com',
  'netmails.net', 'netzidiot.de', 'neverbox.com', 'nice-4u.com', 'nincsmail.hu',
  'nm7.cc', 'no-spam.ws', 'noblepioneer.com', 'nobulk.com', 'noclickemail.com',
  'nogmailspam.info', 'nomail.pw', 'nomail.xl.cx', 'nomail2me.com', 'nomorespamemails.com',
  'nonspam.eu', 'nonspammer.de', 'noref.in', 'nospam.ze.tc', 'nospam4.us',
  'nospamfor.us', 'nospammail.net', 'nospamthanks.info', 'notmailinator.com',
  'notsharingmy.info', 'nowmymail.com', 'nubescontrol.com', 'nus.edu.sg',
  'objectmail.com', 'obobbo.com', 'odnorazovoe.ru', 'oneoffemail.com', 'onewaymail.com',
  'oopi.org', 'opayq.com', 'opentrash.com', 'ordinaryamerican.net', 'otherinbox.com',
  'ourklips.com', 'outlawspam.com', 'ovpn.to', 'owlpic.com', 'pancakemail.com',
  'pcusers.otherinbox.com', 'pjjkp.com', 'plexolan.de', 'poczta.onet.pl', 'politikerclub.de',
  'pookmail.com', 'pooooo.io', 'privacy.net', 'privatdemail.net', 'proxymail.eu',
  'prtnx.com', 'prtz.eu', 'punkass.com', 'putthisinyourspamdatabase.com', 'pwrby.com',
  'qq.com', 'quickinbox.com', 'rainmail.biz', 'raqid.com', 'rcpt.at',
  'reallymymail.com', 'realtyalerts.ca', 'recode.me', 'recursor.net', 'recyclemail.dk',
  'regbypass.com', 'regbypass.comsafe-mail.net', 'rejectmail.com', 'reliable-mail.com',
  'rhyta.com', 'rmqkr.net', 'rppkn.com', 'rtrtr.com', 's0ny.net',
  'safe-mail.net', 'safemail.icu', 'safersignup.de', 'safetymail.info', 'safetypost.de',
  'sandelf.de', 'sausen.com', 'schafmail.de', 'schrott-email.de', 'secretemail.de',
  'secure-mail.biz', 'seekapps.com', 'selfdestructingmail.com', 'sendspamhere.com',
  'sharklasers.com', 'shieldedmail.com', 'shiftmail.com', 'shitmail.de', 'shitmail.me',
  'shitware.nl', 'shmeriously.com', 'shortmail.net', 'sibmail.com', 'sify.com',
  'sinnlos-mail.de', 'siteposter.net', 'skeefmail.com', 'slapsfromlastnight.com',
];
DISPOSABLE_BATCH_3.forEach((d) => DISPOSABLE_DOMAINS.add(d));

const DISPOSABLE_BATCH_4 = [
  'slaskpost.se', 'slipry.net', 'slopsbox.com', 'slushmail.com', 'smashmail.de',
  'smellfear.com', 'snakemail.com', 'sneakemail.com', 'sneakmail.de', 'snkmail.com',
  'sofimail.com', 'sofort-mail.de', 'sogetthis.com', 'soodonims.com', 'spam.la',
  'spam.su', 'spam4.me', 'spamail.de', 'spamarrest.com', 'spambob.net',
  'spambob.org', 'spambog.com', 'spambog.de', 'spambog.ru', 'spambox.us',
  'spamcannon.com', 'spamcannon.net', 'spamcero.com', 'spamcon.org', 'spamcorptastic.com',
  'spamcowboy.com', 'spamcowboy.net', 'spamcowboy.org', 'spamday.com', 'spamex.com',
  'spamfree.eu', 'spamfree24.com', 'spamfree24.de', 'spamfree24.eu', 'spamfree24.info',
  'spamfree24.net', 'spamfree24.org', 'spamgoes.in', 'spamgourmet.com', 'spamgourmet.net',
  'spamgourmet.org', 'spamherelots.com', 'spamhereplease.com', 'spamhole.com',
  'spamify.com', 'spaminator.de', 'spamkill.info', 'spaml.com', 'spaml.de',
  'spammotel.com', 'spamobox.com', 'spamoff.de', 'spamslicer.com', 'spamspot.com',
  'spamthis.co.uk', 'spamthisplease.com', 'spamtrail.com', 'spamtroll.net',
  'speed.1s.fr', 'spikio.com', 'spoofmail.de', 'squizzy.de', 'ssoia.com',
  'startkeys.com', 'stinkefinger.net', 'stop-my-spam.com', 'streetwisemail.com',
  'stuffmail.de', 'super-auswahl.de', 'supergreatmail.com', 'supermailer.jp',
  'superrito.com', 'superstachel.de', 'suremail.info', 'svk.jp', 'sweetxxx.de',
  'tafmail.com', 'tagyourself.com', 'talkinator.com', 'tapchicuoihoi.com',
  'teewars.org', 'teleworm.com', 'teleworm.us', 'temp-mail.com', 'temp-mail.de',
  'temp-mail.org', 'temp-mail.ru', 'tempail.com', 'tempalias.com', 'tempe-mail.com',
  'tempemail.biz', 'tempemail.com', 'tempemail.net', 'tempinbox.co.uk', 'tempinbox.com',
  'tempmail.de', 'tempmail.eu', 'tempmail.it', 'tempmail.us', 'tempmail2.com',
  'tempmaildemo.com', 'tempmailer.com', 'tempmailer.de', 'tempomail.fr', 'tempsky.com',
  'tempthe.net', 'thanksnospam.info', 'thankyou2010.com', 'thc.st', 'thecloudindex.com',
  'thelimestones.com', 'thisisnotmyrealemail.com', 'thismail.net', 'throwawayemailaddress.com',
  'tilien.com', 'tittbit.in', 'tizi.com', 'tmail.ws', 'tmailinator.com',
  'toiea.com', 'tokenmail.de', 'toomail.biz', 'topranklist.de', 'tradermail.info',
  'trash-mail.at', 'trash-mail.com', 'trash-mail.de', 'trash2009.com', 'trash2010.com',
  'trash2011.com', 'trashdevil.com', 'trashemail.de', 'trashmail.at', 'trashmail.com',
  'trashmail.io', 'trashmail.me', 'trashmail.net', 'trashmail.org', 'trashmail.ws',
  'trashmailer.com', 'trashymail.com', 'trashymail.net', 'trayna.com', 'trbvm.com',
  'trialmail.de', 'trillianpro.com', 'turual.com', 'twinmail.de', 'twoweirdtricks.com',
  'tyldd.com', 'uggsrock.com', 'umail.net', 'upliftnow.com', 'uplipht.com',
  'uroid.com', 'us.af', 'venompen.com', 'veryrealemail.com', 'viditag.com',
  'viewcastmedia.com', 'viewcastmedia.net', 'viewcastmedia.org', 'vinbox.com',
  'vipmail.name', 'vipmail.pw', 'vomoto.com', 'vpn.st', 'vsimcard.com',
  'vubby.com', 'walala.org', 'walkmail.net', 'walkmail.ru', 'webemail.me',
  'webm4il.info', 'weg-werf-email.de', 'wegwerf-email-addressen.de', 'wegwerf-emails.de',
  'wegwerfadresse.de', 'wegwerfemail.com', 'wegwerfemail.de', 'wegwerfemailadresse.com',
  'wegwerfmail.de', 'wegwerfmail.info', 'wegwerfmail.net', 'wegwerfmail.org',
  'wegwerpmailadres.nl', 'wetrainbayarea.com', 'wetrainbayarea.org', 'wh4f.org',
  'whyspam.me', 'wickmail.net', 'wilemail.com', 'willhackforfood.biz', 'willselfdestruct.com',
  'winemaven.info', 'wronghead.com', 'wuzup.net', 'wuzupmail.net', 'www.e4ward.com',
  'wwwnew.eu', 'xagloo.com', 'xemaps.com', 'xents.com', 'xmaily.com',
  'xoxy.net', 'yapped.net', 'yeah.net', 'yep.it', 'yogamaven.com',
  'yopmail.com', 'yopmail.fr', 'yopmail.gq', 'yopmail.net', 'yopweb.com',
  'youmailr.com', 'youremailshere.com', 'ypmail.webarnak.fr.eu.org', 'yuurok.com',
  'z1p.biz', 'za.com', 'zehnminuten.de', 'zehnminutenmail.de', 'zetmail.com',
  'zippymail.info', 'zoaxe.com', 'zoemail.com', 'zoemail.net', 'zoemail.org',
  'zomg.info', 'zxcv.com', 'zxcvbnm.com', 'zzz.com',
];
DISPOSABLE_BATCH_4.forEach((d) => DISPOSABLE_DOMAINS.add(d));

// Domains/local-parts that are real, live, deliverable mail infrastructure —
// NOT disposable — but are never a genuine business contact. The common case
// is a website builder embedding its own client-side error-tracking DSN key
// in every site's page source (e.g. Wix's `sentry.wixpress.com` relay); the
// scraper's email regex matches `<hash>@sentry.wixpress.com` because a
// Sentry DSN string is shaped exactly like an email address. The hash is
// unique per site but the domain is identical across every site built on
// the same platform, so this recurs across many unrelated scraped leads.
export const TRACKING_INFRASTRUCTURE_DOMAINS = new Set<string>([
  'wixpress.com',
]);

// Bare 20+ char hex strings (no separators) are machine-generated tokens/
// keys, not human or role-account local parts.
const HEX_TOKEN_LOCAL_PART = /^[a-f0-9]{20,}$/i;

export function isTrackingInfrastructureDomain(domain: string): boolean {
  const d = domain.toLowerCase().trim();
  for (const blocked of TRACKING_INFRASTRUCTURE_DOMAINS) {
    if (d === blocked || d.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

export function isNonContactAddress(localPart: string, domain: string): boolean {
  return isTrackingInfrastructureDomain(domain) || HEX_TOKEN_LOCAL_PART.test(localPart);
}

// Exact MX hostname lookup map (substring match against primary MX).
export const MX_PROVIDERS: Record<string, MxProviderInfo> = {
  'aspmx.l.google.com': { name: 'google_workspace', type: 'business', catchAllLikelihood: 'low', reputationBonus: 15 },
  'alt1.aspmx.l.google.com': { name: 'google_workspace', type: 'business', catchAllLikelihood: 'low', reputationBonus: 15 },
  'alt2.aspmx.l.google.com': { name: 'google_workspace', type: 'business', catchAllLikelihood: 'low', reputationBonus: 15 },
  'aspmx2.googlemail.com': { name: 'google_workspace', type: 'business', catchAllLikelihood: 'low', reputationBonus: 15 },
  'aspmx3.googlemail.com': { name: 'google_workspace', type: 'business', catchAllLikelihood: 'low', reputationBonus: 15 },
  'mail.protection.outlook.com': { name: 'microsoft_365', type: 'business', catchAllLikelihood: 'low', reputationBonus: 15 },
  'eo.outlook.com': { name: 'microsoft_365', type: 'business', catchAllLikelihood: 'low', reputationBonus: 15 },
  'mx.zoho.com': { name: 'zoho', type: 'business', catchAllLikelihood: 'medium', reputationBonus: 10 },
  'mx2.zoho.com': { name: 'zoho', type: 'business', catchAllLikelihood: 'medium', reputationBonus: 10 },
  'mx3.zoho.com': { name: 'zoho', type: 'business', catchAllLikelihood: 'medium', reputationBonus: 10 },
  'mx.zoho.eu': { name: 'zoho', type: 'business', catchAllLikelihood: 'medium', reputationBonus: 10 },
  'mx.zoho.in': { name: 'zoho', type: 'business', catchAllLikelihood: 'medium', reputationBonus: 10 },
  'mailstore1.secureserver.net': { name: 'godaddy', type: 'hosting', catchAllLikelihood: 'high', reputationBonus: -5 },
  'smtp.secureserver.net': { name: 'godaddy', type: 'hosting', catchAllLikelihood: 'high', reputationBonus: -5 },
  'mx.fastmail.com': { name: 'fastmail', type: 'business', catchAllLikelihood: 'low', reputationBonus: 12 },
  'in1-smtp.messagingengine.com': { name: 'fastmail', type: 'business', catchAllLikelihood: 'low', reputationBonus: 12 },
  'mxa.mailgun.org': { name: 'mailgun', type: 'business', catchAllLikelihood: 'low', reputationBonus: 10 },
  'mxb.mailgun.org': { name: 'mailgun', type: 'business', catchAllLikelihood: 'low', reputationBonus: 10 },
  'mx.sendgrid.net': { name: 'sendgrid', type: 'business', catchAllLikelihood: 'low', reputationBonus: 10 },
  'feedback-smtp.us-east-1.amazonses.com': { name: 'amazon_ses', type: 'business', catchAllLikelihood: 'low', reputationBonus: 10 },
  'inbound-smtp.us-east-1.amazonaws.com': { name: 'amazon_ses', type: 'business', catchAllLikelihood: 'low', reputationBonus: 10 },
  'aspmx.pars.sk': { name: 'pars', type: 'business', catchAllLikelihood: 'medium', reputationBonus: 5 },
};

// Pattern-based provider detection - checked after exact MX_PROVIDERS lookup misses.
export const MX_PROVIDER_PATTERNS: Array<{ pattern: RegExp; info: MxProviderInfo }> = [
  { pattern: /\.google\.com$/i, info: { name: 'google_workspace', type: 'business', catchAllLikelihood: 'low', reputationBonus: 15 } },
  { pattern: /googlemail\.com$/i, info: { name: 'gmail', type: 'free', catchAllLikelihood: 'low', reputationBonus: 5 } },
  { pattern: /\.outlook\.com$/i, info: { name: 'microsoft_365', type: 'business', catchAllLikelihood: 'low', reputationBonus: 15 } },
  { pattern: /protection\.outlook\.com$/i, info: { name: 'microsoft_365', type: 'business', catchAllLikelihood: 'low', reputationBonus: 15 } },
  { pattern: /\.zoho\.(com|eu|in)$/i, info: { name: 'zoho', type: 'business', catchAllLikelihood: 'medium', reputationBonus: 10 } },
  { pattern: /protonmail\.ch$/i, info: { name: 'protonmail', type: 'free', catchAllLikelihood: 'low', reputationBonus: 5 } },
  { pattern: /yandex\.(net|ru)$/i, info: { name: 'yandex', type: 'free', catchAllLikelihood: 'low', reputationBonus: 0 } },
  { pattern: /\.qq\.com$/i, info: { name: 'tencent', type: 'free', catchAllLikelihood: 'low', reputationBonus: 0 } },
  { pattern: /pphosted\.com$/i, info: { name: 'proofpoint', type: 'business', catchAllLikelihood: 'low', reputationBonus: 12 } },
  { pattern: /mimecast/i, info: { name: 'mimecast', type: 'business', catchAllLikelihood: 'low', reputationBonus: 12 } },
  { pattern: /barracuda/i, info: { name: 'barracuda', type: 'business', catchAllLikelihood: 'medium', reputationBonus: 8 } },
  { pattern: /messagelabs\.com$/i, info: { name: 'symantec', type: 'business', catchAllLikelihood: 'low', reputationBonus: 10 } },
  { pattern: /cisco\.com$/i, info: { name: 'cisco_ironport', type: 'business', catchAllLikelihood: 'low', reputationBonus: 10 } },
  { pattern: /secureserver\.net$/i, info: { name: 'godaddy', type: 'hosting', catchAllLikelihood: 'high', reputationBonus: -5 } },
  { pattern: /emailsrvr\.com$/i, info: { name: 'rackspace', type: 'hosting', catchAllLikelihood: 'medium', reputationBonus: 5 } },
  { pattern: /(hostgator|bluehost|siteground|dreamhost|namecheap)/i, info: { name: 'shared_hosting', type: 'hosting', catchAllLikelihood: 'high', reputationBonus: -5 } },
  { pattern: /(cpanel|plesk|directadmin)/i, info: { name: 'control_panel', type: 'hosting', catchAllLikelihood: 'high', reputationBonus: -5 } },
];
