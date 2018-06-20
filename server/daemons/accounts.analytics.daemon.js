// Accounts analytics for airdrops (public info)
const async			= require('async');
const mongoose      = require("mongoose");
const config      	= require('../../config');

const EOS     		= require('eosjs');
const eos     		= EOS(config.eosConfig);

const log4js      = require('log4js');
log4js.configure(config.logger);
const log         = log4js.getLogger('accounts_analytics');
const logSlack    = log4js.getLogger('slack_notify');

const eosToInt = 10000;

mongoose.Promise = global.Promise;
const mongoMain  = mongoose.createConnection(config.MONGO_URI, config.MONGO_OPTIONS,
 (err) => {
    if (err){
      log.error(err);
      process.exit(1);
    }
    console.info('[Connected to Mongo EOS in accounts daemon] : 27017');
});

const STATS_ACCOUNT = require('../models/api.accounts.model')(mongoMain);



process.on('uncaughtException', (err) => {
	// rewrite to slack notify
    logSlack.error('======= UncaughtException Accounts daemon server : ', err);
    process.exit(1);
});

function getAccountsAnalytics (){
	async.waterfall([
		(cb) => {
			STATS_ACCOUNT.distinct("account_name").exec((err, result) => {
				if (err){
					return cb(err);
				}
				if (!result){
					return cb(result);
				}
				cb(null, result);
			});
		},
		(result, cb) => {
			let counter = 0;
			async.eachLimit(result, config.limitAsync, (elem, ret) => {
			   	eos.getAccount({ account_name: elem })
			   		.then(account => {
			   			findBalanceAndUpdate(account, () => {
			   				log.info('==== accounts updated - cursor ', counter++);
			   				ret();
			   			});
			   		})
			   		.catch(err => {
			   			log.error('====== getAccountsAnalytics getAccount elem error - ', err);
			   			ret();
			   		});
			   	}, (err) => {
			   		if (err){
			   			return cb(err)
			   		}
			   		cb(null);
			   	});
		},
	], (err) => {
		if (err){
			log.error(err);
			process.exit(1);
		}
		log.info('===== end analytics function ');
		process.exit(0);
	});
};

function findBalanceAndUpdate(account, callback) {
	  if (!account){
		  return callback();
      }
      let accInfo = {
		  staked: 0,
		  unstaked: 0,
		  balance_eos: 0,
		  balance: []
	  };
      if (account && account.voter_info && account.voter_info.staked){
			accInfo.staked = account.voter_info.staked / eosToInt;
      }

 	  eos.getCurrencyBalance({
      			code: 'eosio.token',
      			account: account.account_name
			})
	   	 	.then(balance => {
	   	 		accInfo.balance = Array.isArray(balance) ? balance : [];
	   	 		accInfo.balance.forEach((elem) => {
	   	 			if (elem.indexOf('EOS') !== -1){
	   	 				accInfo.unstaked = !isNaN(Number(elem.split(' ')[0])) ? Number(elem.split(' ')[0]) : 0;
	   	 			}
	   	 		});
	   	 		accInfo.balance_eos = accInfo.unstaked + accInfo.staked;
	   	 		STATS_ACCOUNT.findOneAndUpdate({ account_name: account.account_name }, {  staked: accInfo.staked,
	   	 																				  unstaked: accInfo.unstaked,
	   	 																				  balance_eos: accInfo.balance_eos,
	   	 																				  balance: accInfo.balance }, {multi: true})
	   	 				     .exec((err) => {
	   	 				     	if (err){
	   	 				     		log.error(err);
	   	 				     	}
	   	 				     	callback();
	   	 				     });
	   	 	})
	   	 	.catch(err => {
	   	 		log.error(err);
	   	 		callback();
	   	 	});
}


getAccountsAnalytics();

