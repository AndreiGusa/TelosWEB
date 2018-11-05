/*
   Created by eoswebnetbp1
*/

const async = require('async');
const path = require('path');
const customFunctions = require('./eos.api.v1.custom');
const axios = require('axios');

module.exports 	= function(router, config, request, log, eos, mongoMain, mongoCache, MARIA) {

	const PRODUCER 	= require('../models/producer.model')(mongoMain);
	const FAUCET 	= require('../models/faucet.model')(mongoMain);
	const STATS_AGGR 	= require('../models/api.stats.model')(mongoMain);
	const STATS_ACCOUNT = require('../models/api.accounts.model')(mongoMain);
	const RAM 			= require('../models/ram.price.model')(mongoMain);
	const RAM_ORDERS 	= require('../models/ram.orders.model')(mongoMain);
	const TRX_ACTIONS = require('../models/trx.actions.history.model')(mongoMain);
	const CACHE_ACCOUNT = require('../models/nodeos.accounts.model')(mongoCache);
	const CACHE_TRANSACTIONS = require('../models/nodeos.transactions.model')(mongoCache);
	const CACHE_TRANSACTION_TRACES = require('../models/nodeos.transaction_traces.model')(mongoCache);
	const CACHE_ACTION_TRACES = require('../models/nodeos.action_traces.model')(mongoCache);
	const CACHE_PUB_KEYS = require('../models/nodeos.pub_keys.model')(mongoCache);

    //============ HISTORY API
	/*
	* router - search global aggregation
	*/
	router.post('/api/v1/search', (req, res) => {
		let text = req.body.text;
		if (!text){
			return res.status(501).send('Wrong search input!');
		}

		async.parallel({
			block: (cb) =>{
        		eos.getBlock({ block_num_or_id: text })
	   			 	.then(result => {
	   			 		cb(null, result);
	   			 	})
	   			 	.catch(err => {
	   			 		log.error(err);
	   			 		cb(null, null);
	   			 	});
			},
			transaction: (cb) =>{
				// db.transactions.find({ trx_id: text }).pretty()
				CACHE_TRANSACTIONS.find({trx_id:text},(err, result) => {
					if(err || !result || result.length === 0){
						eos.getTransaction({ id: text })
								.then(result => {
									cb(null, result);
								})
								.catch(err => {
									cb(null, null);
								});
					}else{
						cb(null,{id: result[0].trx_id});
					}
				});
			},
			account: (cb) =>{
				// console.log(CACHE_ACCOUNT.find({ name: text}, function(err,res){
				// 	console.log("result 1>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> ", err,res);
				// }));

				eos.getAccount({ account_name: text })
	   			 	.then(result => {
	   			 		cb(null, result);
	   			 	})
	   			 	.catch(err => {
	   			 		cb(null, null);
	   			 	});
			},
			key: (cb) => {
				// db.pub_keys.find({ public_key: text }).pretty()
				CACHE_PUB_KEYS.find({public_key:text},(err, result) => {
					if(err || !result || result.length === 0){
						eos.getTransaction({ id: text })
								.then(result => {
									cb(null, result);
								})
								.catch(err => {
									cb(null, null);
								});
					}else{
						cb(null,{id: result[0].trx_id});
					}
				});
			}
			// ,
			// contract: (cb) =>{
			// 	eos.getAbi({ json: true, account_name: text })
	   	 	// 		.then(result => {
	   	 	// 			cb(null, result)
	   	 	// 		})
	   	 	// 		.catch(err => {
	   	 	// 			cb(null, null);
	   	 	// 		});
			// }
		}, (err, result) => {
			if (err){
				log.error(err);
				return res.status(501).end();
			}
			res.json(result);
		});
	});

	router.get('/api/v1/get_wallet_api', (req, res) => {
		res.json({ host: config.walletAPI.host, port: config.walletAPI.port, protocol: config.walletAPI.protocol });
	});
	

	/*
	* router - ram_order
	* params - offset
	*/
	router.post('/api/v1/ram_order', (req, res) => {
		 let type 		= req.body.type;
		 let tx_id 		= req.body.tx_id;
		 let account 	= req.body.account;
		 let amount 	= req.body.amount;
		 let price 		= req.body.price;

		 let order = new RAM_ORDERS({
		 		type: type,
		 		tx_id: tx_id,
		 		account: account,
		 		amount: amount,
		 		price: price
		 });

		 order.save(err => {
		 	if (err){
		 		log.error(err);
		 		return res.status(500).end();
		 	}
		 	res.json({ message: 'order successfully saved' });
		 });
	});

	/*
	* router - get_analytics
	* params - offset
	*/
	router.post('/api/v1/get_trx_actions', (req, res) => {
		 TRX_ACTIONS.aggregate()
		 			.match({ date: { $gte : new Date(req.body.date) } })
		 			.sort({ date: 1 })
		 			.group({
		 				_id: {
            					year: { $year: "$date" },
            					dayOfMonth: { $dayOfMonth: "$date" },
            					month: { $month: "$date" },
        				},
        				transactions: { "$push": "$transactions" },
        				actions: { "$push": "$actions" }
		 			})
		 			.exec((err, result) => {
		 				if (err){
		 					log.error(err);
		 					return res.status(500).end();
		 				}
		 				res.json(result);
		 			});
	});
	/*
	* router - ram_orders
	* params - offset
	*/
	router.get('/api/v1/ram_orders/:account', (req, res) => {
		RAM_ORDERS.find({ account: req.params.account })
		  .sort({ date: -1 })
		  .exec((err, result) => {
		 	if (err){
		 		log.error(err);
		 		return res.status(500).end();
		 	}
		 	res.json(result);
		 });
	});

	/*
	* router - get_accounts_analytics
	* params - offset
	*/
	router.get('/api/v1/get_accounts_analytics/:offset', (req, res) => {
		 STATS_ACCOUNT.find()
	   	 		.sort({ balance_eos: -1 })
	   	 		.limit(Number(req.params.offset))
	   	 		.exec((err, result) => {
	   	 		if (err){
	   	 			log.error(err);
	   	 			return res.status(500).end();
	   	 		}
	   	 		res.json(result);
	   	 });
	});

	/*
	* router - get_chart_ram
	* params - offset
	*/
	router.post('/api/v1/get_chart_ram', (req, res) => {
		let query = (req.body.from === 'All') ? {} : { date : { $gte: new Date(req.body.from) } };
	   	 RAM.find(query)
	   	 		.exec((err, result) => {
	   	 		if (err){
	   	 			log.error(err);
	   	 			return res.status(500).end();
	   	 		}
	   	 		res.json(result);
	   	 });
	});

	/*
	* router - get_block
	* params - block_num_or_id
	*/
	router.get('/api/v1/get_block/:block_num_or_id', (req, res) => {
	   	 eos.getBlock({ block_num_or_id: req.params.block_num_or_id })
	   	 	.then(result => {
	   	 		res.json(result);
	   	 	})
	   	 	.catch(err => {
	   	 		log.error(err);
	   	 		res.status(501).end();
	   	 	});
	});

    /*
	* router - get_last_blocks
	* params - offset (number of last blocks you want to get)
	*/
	router.get('/api/v1/get_last_blocks/:offset', (req, res) => {
		let elements = [];
		let offset = req.params.offset;
		for(let i = 0; i <= offset; i++){
			elements.push(i);
		}
		customFunctions.getLastBlocks(eos, elements, (err, result) => {
				if (err){
					log.error(err);
					return res.status(501).end();
				}
				res.json(result);
		});
	});

    /*
	* router - get_aggregation_stat
	*/
	router.get('/api/v1/get_aggregation_stat', (req, res) => {
		STATS_AGGR.findOne({}, (err, result) => {
			if (err){
				log.error(err);
				return res.status(501).end();
			}
			res.json(result);
		});
	});

    /*
	* router - get code
	* params - account name
	*/
	router.get('/api/v1/get_code/:account', (req, res) => {
	   	 eos.getAbi({
      			json: true,
      			account_name: req.params.account,
			})
	   	 	.then(result => {
	   	 		res.json(result);
	   	 	})
	   	 	.catch(err => {
	   	 		log.error(err);
	   	 		res.status(501).end();
	   	 	});
	});

    /*
	* router - get currency balance
	*/
	router.get('/api/v1/get_currency_balance/:code/:account/:symbol', (req, res) => {
	   	 eos.getCurrencyBalance({
      			code: req.params.code,
      			account: req.params.account,
      			symbol: req.params.symbol
			})
	   	 	.then(result => {
	   	 		res.json(result);
	   	 	})
	   	 	.catch(err => {
	   	 		log.error(err);
	   	 		res.status(501).end();
	   	 	});
	});

    /*
	* router - get_table_rows
	*/
	router.get('/api/v1/get_table_rows/:code/:scope/:table/:limit', (req, res) => {
	   	 eos.getTableRows({
			      json: true,
			      code: req.params.code,
			      scope: req.params.scope,
			      table: req.params.table,
			      table_key: "string",
			      lower_bound: "0",
			      upper_bound: "-1",
			      limit: req.params.limit
			})
	   	 	.then(result => {
	   	 		res.json(result);
	   	 	})
	   	 	.catch(err => {
	   	 		log.error(err);
	   	 		res.status(501).end();
	   	 	});
	});

    /*
	* router - get_table_rows
	*/
	router.get('/api/v1/get_producers/:lower_bound/:limit', (req, res) => {
		let producers = {};
		eos.getProducers(true, req.params.lower_bound === "0" ? "" : req.params.lower_bound, req.params.limit)
		.then(result => {
			if(!result){
				res.status(400).send("Could not get Producers!");
				return;
			}

			producers = {
				list: result.rows || [],
				total_producer_vote_weight: result.total_producer_vote_weight || -1,
				nextPage: result.more || ""
			};

			const producerNames = {list:[],reverseMap:{}};
			for(let i = 0; i < producers.list.length; i++){
				producerNames.list.push(producers.list[i].owner);
				producerNames.reverseMap[producers.list[i].owner] = i;
			}

			PRODUCER.where({"name": {$in: producerNames.list}}).select("name latitude longitude").find((err, prods)=>{
				if(err){log.error(err);}
				if(prods){
					for(let i = 0; i < prods.length; i++){
						producers.list[producerNames.reverseMap[prods[i].name]].geoLocation = [prods[i].latitude, prods[i].longitude];
					}
				}
				
				if( req.params.lower_bound === "0" || req.params.limit === "1"){
					eos.getProducerSchedule((err, schedule)=>{
						producers.extras = [];

						if(err){
							log.error(err);
						}else if(schedule.active && schedule.active.producers){
							const tmp = schedule.active.producers;
							for(let i = 0; i < tmp.length; i++){
								if(producers.list[producerNames.reverseMap[tmp[i].producer_name]]){
									producers.list[producerNames.reverseMap[tmp[i].producer_name]].active = true;
								}else{
									producers.extras.push(tmp[i].producer_name);
								}
							}
						}

						res.json(producers);		
					});
				}else{
					res.json(producers);
				}
			});
		})
		.catch(err => {
			log.error(err);
			res.status(501).end();
		});
	});

    /*
	* router - get_table_rows
	*/
	router.get('/api/v1/get_producer/:name', (req, res) => {
		let producers = {};
		eos.getProducers(true, req.params.name, 1)
		.then(result => {
			if(!result){
				res.status(400).send("Could not get the Producer!");
				return;
			}

			producers = {
				list: result.rows || [],
				total_producer_vote_weight: result.total_producer_vote_weight || -1
			};

			PRODUCER.where({"name": req.params.name}).findOne((err, prods)=>{
				if(err){log.error(err);}
				if(prods && producers.list.length){
					producers.list[0].details = prods;
				}
				
				res.json(producers);
			});
		})
		.catch(err => {
			log.error(err);
			res.status(501).end();
		});
	});

    /*
	* router - get_table_rows producers
	*/
	router.get('/api/custom/get_table_rows/:code/:scope/:table/:limit', (req, res) => {
		let formData = { json: true,
			      code: req.params.code,
			      scope: req.params.scope,
			      table: req.params.table,
			      limit: req.params.limit
		};
	   	request.post({url:`${config.customChain}/v1/chain/get_table_rows`, json: formData}).pipe(res);
	});

	router.get('/api/custom/get_producer_schedule', (req, res) => {
		request.post({url:`${config.customChain}/v1/chain/get_producer_schedule`, json: {}}, (e, r, body) => {
			var x = body.active.producers;
			async.each( x, 
				(prod, cb)=>{
					PRODUCER.where({"name":prod.producer_name}).findOne((err, p)=>{
						if(err){return cb(err);}
						if(p){
							prod.location = [p.latitude, p.longitude];
						}
						cb();
					});
				}, 
				(err)=>{
					if(err){
						log.error(err);
					}
					res.json(body);	
				}
			);
		});
	});

	router.post('/api/producer', (req, res) => {
		// if (req.body.url && req.body.url.indexOf('eosweb.net') >= 0 ){
		// 	return res.sendFile(path.join(__dirname, '../../bp.json'));
		// }
	   	request.get(`${req.body.url}`).pipe(res);
	});

	/*
	* router - get_actions
	* params - account_name, position, offset
	*/
	// router.get('/api/v1/get_actions/:account_name/:created/:limit/:offset', (req, res) => {
	router.post('/api/v1/get_actions/:account_name', (req, res) => {
		let account_name = req.params.account_name,
			upper_bound = req.body.upper ? new Date(req.body.upper) : new Date(),
			limit = req.body.limit || 20,
			offset = req.body.offset || 0;

		CACHE_ACTION_TRACES.aggregate([
			{ 
				"$match": {
					"receipt.receiver": account_name, 
					"createdAt": {
						"$lt": upper_bound
					}
				} 
			},
			{ 
				"$sort": {
					"createdAt":-1
				} 
			},
			{ "$limit": limit },
			{ "$skip": offset },
			// {
			// 	"$lookup": {
			// 		"from":"transactions", 
			// 		"localField":"trx_id", 
			// 		"foreignField":"trx_id", 
			// 		"as":"transactions"
			// 	}
			// },
			// {
			// 	"$lookup": {
			// 		"from":"transaction_traces", 
			// 		"localField":"trx_id", 
			// 		"foreignField":"id", 
			// 		"as":"transaction_traces"
			// 	}
			// }
		 ]).exec(function(err, results){
			if(err){
				log.error(err);
				res.status(500).json(err);
			}else{
				res.json(results);
			}
		 });
		 
	});

	/*
	* router - get_transaction
	* params - transaction_id_type
	*/
	router.get('/api/v1/get_transaction/:transaction_id_type', (req, res) => {
		CACHE_TRANSACTIONS.find({trx_id: req.params.transaction_id_type},(err, result) => {
			if(err || !result || result.length === 0){
				log.error(err);
				res.status(501).end();
			}else{
				CACHE_ACTION_TRACES.find({trx_id: req.params.transaction_id_type}, (err,result2) => {
					const obj = {
						transactions: result
					};
					if(err || !result || result.length === 0){
						obj.traces = -1;
					}else{
						obj.traces = result2;
					}
					
					res.json(obj);
				});
			}
		});
	});

	/*
	* router - get_transactions
	* params - transaction_id_type
	*/
	router.get('/api/v1/get_transactions', (req, res) => {

	   	 eos.getTransaction({})
	   	 	.then(result => {
	   	 		res.json(result);
	   	 	})
	   	 	.catch(err => {
	   	 		log.error(err);
	   	 		res.status(501).end();
	   	 	});

	   	 	eos.getAccount({account_name: "eosio"})
	   	 	.then(result => {
	   	 		log.info(result);
	   	 	})
	   	 	.catch(err => {
	   	 		log.error(err);
	   	 		//res.status(501).end();
	   	 	});
	});

	/*
	* router - get_info
	*/
	router.get('/api/v1/get_info', (req, res) => {
	   	 eos.getInfo({})
	   	 	.then(result => {
	   	 		res.json(result);
	   	 	})
	   	 	.catch(err => {
	   	 		log.error(err);
	   	 		res.status(501).end();
	   	 	});
	});
	//============ END of HISTORY API


	//============ CHAIN API
	/*
	* router - get_currency_stats
	* params - code: 'name', symbol: 'string'
	*/
	router.get('/api/v1/get_currency_stats/:code/:symbol', (req, res) => {
	   	 eos.getCurrencyStats({
	   	 		code: req.params.code,
	   	 		symbol: req.params.symbol
	   	 	})
	   	 	.then(result => {
	   	 		res.json(result);
	   	 	})
	   	 	.catch(err => {
	   	 		log.error(err);
	   	 		res.status(501).end();
	   	 	});
	});
	//============ END of CHAIN API

	//============ Account API
	/*
	* router - get_account
	* params - name
	*/
	router.get('/api/v1/get_account/:name', (req, res) => {
		eos.getAccount({
			account_name: req.params.name
		})
		.then(result => {
			res.json(result);
		})
		.catch(err => {
			log.error(err);
			res.status(501).end();
		});
	});

	/*
	* router - get_account
	* params - name
	*/
	router.get('/api/v1/get_key_accounts/:key', (req, res) => {
	   	 eos.getKeyAccounts({
	   	 		public_key: req.params.key
	   	 	})
	   	 	.then(result => {
	   	 		res.json(result);
	   	 	})
	   	 	.catch(err => {
	   	 		log.error(err);
	   	 		res.status(501).end();
	   	 	});
	});

	/*
	* router - get_account_controlled
	* params - name
	*/
	router.get('/api/v1/get_controlled_accounts/:acccount', (req, res) => {
	   	 eos.getControlledAccounts({
	   	 		controlling_account: req.params.acccount
	   	 	})
	   	 	.then(result => {
	   	 		res.json(result);
	   	 	})
	   	 	.catch(err => {
	   	 		log.error(err);
	   	 		res.status(501).end();
	   	 	});
	});
	//============ END of Account API

	//============ Prod API
	/*
	* router - get_account
	* params - name
	*/
	router.get('/api/v1/get_currency_stats/:code/:symbol', (req, res) => {
	   	 eos.getAccount({
	   	 		code: req.params.code,
	   	 		//symbol: req.params.symbol
	   	 	})
	   	 	.then(result => {
	   	 		res.json(result);
	   	 	})
	   	 	.catch(err => {
	   	 		log.error(err);
	   	 		res.status(501).end();
	   	 	});
	});
	//============ END of Account API

	//============ Telos
	/*
	* producer - register
	*/
	router.post('/api/v1/teclos', (req, res) => {
		const data = req.body;
		const ip = data.producer.p2pServerAddress.slice(0, data.producer.p2pServerAddress.lastIndexOf(':'));

		axios.get(`http://ip-api.com/json/${ip}`)
			.catch(err => {
				const error = JSON.parse(err);
				console.log(error);
				res.status(400).send({result: 'error', message: error.message, data: error});
			})
			.then(geoLocData => {
				const producer = Object.assign({}, data.producer);
				producer.latitude = geoLocData.data.lat;
				producer.longitude = geoLocData.data.lon;
				producer.country = geoLocData.data.country;
				producer.region = geoLocData.data.region;
				producer.city = geoLocData.data.city;
				producer.isp = geoLocData.data.isp;

				eos.transaction(tr => {
					tr.newaccount({
						creator: 'testaccoooo1',
						name: producer.name,
						owner: producer.producerPublicKey,
						active: producer.producerPublicKey
					});
				
					tr.buyrambytes({
						payer: 'testaccoooo1',
						receiver: producer.name,
						bytes: 1024*4
					});
				
					tr.delegatebw({
						from: 'testaccoooo1',
						receiver: producer.name,
						stake_net_quantity: '100.0000 TLOS',
						stake_cpu_quantity: '100.0000 TLOS',
						transfer: 1
					});
				})
				.catch(err => {
					const error = JSON.parse(err);
					console.log(error);
					res.status(error.code).send({result: 'error', message: error.message, data: error});
				})
				.then(data => {
					const pModel = new PRODUCER(producer);

					return pModel.save()
						.then(acc => res.status(200).json(data))
						.catch(error => {
							console.log(error);
							res.status(error.code).send({result: 'error', message: error.message, data: error})
						});
				});
			})
			.then(result =>{
				res.status(200).send(result);
			})
			.catch(err => res.status(400).send({result: 'error', message: err.message ? err.message : err, data: {}}));
	});
	//============ END of Register

	//============ Telos
	/*
	* producer - register
	*/
	router.post('/api/v1/teclos/newaccount', (req, res) => {
		const data = req.body;

		eos.transaction(tr => {
			tr.newaccount({
				creator: 'testaccoooo1',
				name: data.name,
				owner: data.publicKey,
				active: data.publicKey
			});
		
			tr.buyrambytes({
				payer: 'testaccoooo1',
				receiver: data.name,
				bytes: 1024*4
			});
		
			tr.delegatebw({
				from: 'testaccoooo1',
				receiver: data.name,
				stake_net_quantity: '10.0000 TLOS',
				stake_cpu_quantity: '10.0000 TLOS',
				transfer: 0
			});
		})
		.then(result =>{
			res.status(200).send(result);
		})
		.catch(err => {
			let error = err;
			try{
				error = JSON.parse(err);
			}catch(ignored){}
			res.status(error.code ? error.code : 500).send({result: 'error', message: error.message ? error.message : "ERROR! check console", data: error.error ? error.error : error});
		})
	});
	//============ END of Register

	// P2P List
	/*
	* producer - account
	*/
	router.get('/api/v1/p2p', (req, res) => {
		const fields = {
			nodeVersion: 1,
			latitude: 1,
			longitude: 1,
			country: 1,
			region: 1,
			city: 1,
			isp: 1,
			name: 1,
			organization: 1,
			httpServerAddress: 1,
			httpsServerAddress: 1,
			p2pServerAddress: 1,
			url: 1
		};

    PRODUCER.find({}, fields, (err, itms) => {
        if (err) console.log(err);
        else  res.status(200).json(itms);
    });
	});
	//============ END of P2P List

	// peer
	/*
	* producer - account
	*/
	router.get('/api/v1/p2p/:name', (req, res) => {
		const fields = {
			nodeVersion: 1,
			latitude: 1,
			longitude: 1,
			country: 1,
			region: 1,
			city: 1,
			isp: 1,
			name: 1,
			organization: 1,
			httpServerAddress: 1,
			httpsServerAddress: 1,
			p2pServerAddress: 1,
			url: 1
		};

		PRODUCER.find({name: req.params.name}, fields, (error, result) => {
			if (error) res.status(400).json(error)
			else {
				let peer = result[0];
				peer
				res.status(200).send(peer);
			}
		});
	});
	//============ END of peer

	// Faucet
	const MAX_TX_PER_ACCOUNT = 400;
	const MAX_TX_PER_HOUR = 400;
	const SYMBOL = "TLOS";
	const FAUCET_AMOUNT = 100;
	const FAUCET_TX_PER_USER_PER_HOUR = 2;

	/*
	* GET TLOS FROM FAUCET
	*/
	router.post('/api/v1/gettlos', (req, res) => {
		const name = req.body.name;

		async.waterfall([
			(cb) => {
				FAUCET.countDocuments({created: {$gte: Date.now() - (60000 * 60)}}, function(error, count) {
					if (error)
						cb({result: 'error', code: 500, message: 'Database error', data: error})

					if (count >= MAX_TX_PER_HOUR)
						cb({result: 'error', code: 400, message: `Total number of faucet withdrawals per hour(${MAX_TX_PER_HOUR}) was reached! Try later!`, data: {}});

					cb(null);
				});
			},
			(cb) => {
				FAUCET.countDocuments({name, created: {$gte: Date.now() - (60000 * 60)}}, function(error, count) {
					if (error)
						cb({result: 'error', code: 500, message: 'Database error', data: error})

					if (count >= FAUCET_TX_PER_USER_PER_HOUR)
						cb({result: 'error', code: 400, message: `Account has reached ${FAUCET_TX_PER_USER_PER_HOUR} withdrawals per hour`, data: {}});

					cb(null);
				});
			},
			(cb) => {
				FAUCET.countDocuments({name, created: {$gte: Date.now() - (60000 * 60)}}, function(error, count) {
					if (error)
						cb({result: 'error', code: 500, message: 'Database error', data: error})

					if (count > MAX_TX_PER_ACCOUNT)
						cb({result: 'error', code: 400, message: `Account has exceeded withdrawals lifetime (${MAX_TX_PER_ACCOUNT * FAUCET_AMOUNT}.0000 TLOS)`, data: {}});

					cb(null);
				});
			},
			(cb) => {
				eos.transfer('testaccoooo1', name, `${FAUCET_AMOUNT}.0000 ${SYMBOL}`, '')
					.then(() => new FAUCET({name, created: Date.now()}).save())
					.then(data => cb(null, data))
					.catch(err => {
						let error = err;
						try{
							error = JSON.parse(err);
						}catch(ignored){}
						cb({result: 'error', message: error.message, data: error});
					});
			}
		], function (err, result) {
			// res.status(error.code ? error.code : 500).send({result: 'error', message: error.message ? error.message : "ERROR! check console", data: error.error ? error.error : error});
			if (err)
				res.status(err.code).send(err);
			res.status(200).json(result);
		});
	});

	function txPerName(txs) {
		var now = new Date();

		return txs.slice(-1 * FAUCET_TX_PER_USER_PER_HOUR)
			.reduce((val, tx) => {
				const hrDiff1 = (now.valueOf() - new Data(tx.created)) / 3600000; // Convert milliseconds to hours

				if (hrDiff1) return val++;
				else return val;
			}, 0);
	}
	//============ END of Faucet

// ============== end of exports 
};
























