const ecc = require("eosjs-ecc");
const async = require('async');
const axios = require('axios');

ecc.config.address_prefix = "EOS";

module.exports 	= function(router, config, mongoMain) {

	const MONITOR_NEWS 	= require('../models/monitor.news.model')(mongoMain);
	const PRODUCER 	= require('../models/producer.model')(mongoMain);

	router.post('/admin/v1/news', (req, res) => {
		let newsReq = req.body;
		if (!newsReq){
			return res.status(400).send('Nothing sent!');
        }
		// Eos.modules.ecc
		
		MONITOR_NEWS.findOne({}, (err, result) => {
			if (err) {
			   return res.status(400).send('Find news error!');
			}
			let news = result;
			if (!news) {
				news = new MONITOR_NEWS();
				news.message = "";
				news.save((err) => {
					if (err) {
						return res.status(400).send('Save news error!');
					}
					res.json(news);
				});
			}

			if( !ecc.verify(newsReq.signature, newsReq.message, config.ADMIN_PKEY) ){
				return res.status(400).send('Bad signature!');
			}
			
			news.message = newsReq.message;
			news.save((err) => {
				if (err) {
					return res.status(400).send('Save news error!');
				}
				return res.json(news);
			});
		 });
	});
	
	router.get('/admin/v1/news', (req, res) => {
		MONITOR_NEWS.findOne({}, (err, result) => {
			if (err || !result){
				result = new MONITOR_NEWS();
			}
			res.json(result);
		});
    });

	router.patch('/admin/v1/p2p', (req, res) => {
		let data = req.body;
		const producer = Object.keys(data.producer)
			.reduce((producer, attribute) => {
				if (data.producer[attribute])
					producer[attribute] = data.producer[attribute];
				return producer;
			}, {});

		// one or the other
		if (producer.httpsServerAddress)
			producer.httpServerAddress = '';
		else
			producer.httpsServerAddress = '';

		async.waterfall([
			(cb) => {
				if( !ecc.verify(data.signature, JSON.stringify(data.producer), config.ADMIN_PKEY) )
					cb({result: 'error', message: 'Bad signature!', data: {}, code: 400});
				else cb(null);
			},
			(cb) => {
				if (!data.producer.p2pServerAddress)
					return cb(null, {hasSkiped: true});

				const ip = data.producer.p2pServerAddress.slice(0, data.producer.p2pServerAddress.lastIndexOf(':'));

				axios.get(`http://ip-api.com/json/${ip}`)
					.catch(err => {
						const error = JSON.parse(err);
						cb({result: 'error', message: error.message, code: 400, data: error});
					})
					.then(geoLocData => {
						const prod = Object.assign({}, producer);
						prod.latitude = geoLocData.data.lat;
						prod.longitude = geoLocData.data.lon;
						prod.country = geoLocData.data.country;
						prod.region = geoLocData.data.region;
						prod.city = geoLocData.data.city;
						prod.isp = geoLocData.data.isp;

						PRODUCER.updateOne({name: prod.name}, prod, (err, result) => {
							if (err) cb({result: 'error', code: 400, message: err.message, data: err})
							else cb(null, result)
						});
					});
			},
			(stat, cb) => {
				if (!stat.hasSkiped) {
					cb(null, stat);
					return;
				}

				PRODUCER.update(producer, (err, result) => {
					if (err) cb({result: 'error', code: 400, message: err.message, data: err})
					else cb(null)
				});
			}
		], function (err, result) {
			if (err)
				res.status(err.code).send(err);
			res.status(200).json(result);
		});
	});

	router.post('/admin/v1/p2p/delete', (req, res) => {
		let data = req.body;

		if( !ecc.verify(data.signature, JSON.stringify(data.list), config.ADMIN_PKEY) )
			return res.status(400).send({result: 'error', message: 'Bad signature!', data: {}});

		PRODUCER.remove({name: {'$in': data.list}})
			.then((result) => res.status(200).send({result: 'done', message: `${result.nRemoved} peers has been removed!`, data: result}))
			.catch(error => res.status(501).send({result: 'error', message: error.message, data: error}));
	});
}