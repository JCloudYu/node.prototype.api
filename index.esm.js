/**
 *	Author: JCloudYu
 *	Create: 2019/05/27
**/
import http from "http";
import {CheckDataSystemVersion, Config} from "/kernel.esm.js";

import {
	Init as InitRequestHandler,
	CleanUp as CleanUpRequestHandler,
	Handle as HandleRequest,
	HandleSystemError
} from "/handler/_.esm.js";






(async()=>{
	if ( !CheckDataSystemVersion() ) return;
	
	const {server:SERVER_INFO} = Config;
	
	
	// Initializing data source environment
	console.error( "Trying to initialize application runtime environment..." );
	let AppRuntime = null;
	try {
		AppRuntime = await import("/index.runtime.esm.js");
	}
	catch(e) {}
	
	if ( AppRuntime ) {
		if ( AppRuntime.Init ) {
			await AppRuntime.Init();
		}
		
		console.error( "Application runtime environment initialized!" );
	}
	
	
	
	
	
	
	// NOTE: Initialize api modules
	console.error( `Initializing request handler...` );
	await InitRequestHandler();
	
	

	// NOTE: Create server
	console.error( `Creating server instance...` );
	const SERVER = http.createServer((req, res)=>{
		const base_path = req.url||"/";
		const {path, query, fragment} = ParseURLPathDescriptor(base_path);
		
		
		// INFO: Resolve current request's information
		{
			const req_headers = req.headers;
			const now = Date.now();
			const original_path = req_headers['x-forwarded-path']||base_path;
			const prefixed_path = original_path.substring(0, original_path.length - base_path.length)
			Object.defineProperty(req, 'info', {
				value: Object.defineProperties({cookies:{}}, {
					host: {value:req_headers['x-forwarded-host']||req_headers['host']||null, enumerable:true},
					protocol: {value:req_headers['x-forwarded-proto']||'http', enumerable:true},
					remote_ip: {value:req_headers['x-real-ip']||req.socket.remoteAddress, enumerable:true},
					
					// Note that the req.url is able to be manipulated
					url: {value:{
						raw:base_path, routed_path:prefixed_path, path, query, fragment
					}, enumerable:true},
					time: {value:Math.floor(now/1000), enumerable:true},
					time_milli: {value:now, enumerable:true}
				}), enumerable:true
			});
		}
		
		
		
		// NOTE: Handle incoming request with corresponding handler
		Promise.resolve()
		.then(()=>HandleRequest(req, res))
		.catch((err)=>HandleSystemError(req, res, err))
		.finally(async()=>{
			if ( req.readable ) {
				await ((input_stream)=>new Promise((resolve, reject)=>{
					input_stream.on('end', resolve).on('error',reject).on('data',()=>{});
				}))(req);
			}
		
			if ( !(res.writableFinished||res.finished) ) {
				res.end();
			}
		});
	})
	.on('error', (e) => {
		if (e.code === 'EADDRINUSE') {
			SERVER.close();
			console.error( `Cannot bind server onto ${SERVER_INFO.host}:${SERVER_INFO.port}!` );
			setTimeout(()=>process.emit('SIGNAL_TERMINATION'));
			return;
		}
		
		throw e;
	})
	.on('clientError', (err, socket) => {
		socket.end( 'HTTP/1.1 400 Bad Request\r\n\r\n' );
	});
	
	
	
	// NOTE: Start listening
	console.error( `Binding server...` );
	SERVER.listen(SERVER_INFO.port, SERVER_INFO.host, ()=>{
		console.error( `Server is now listening at ${SERVER_INFO.host}:${SERVER_INFO.port}...` );
	});
	
	
	process
	.on( 'SIGTERM', async()=>{
		console.error( `Cleaning up request handlers...` );
		await CleanUpRequestHandler();
		
		
		
		if ( AppRuntime && AppRuntime.CleanUp ) {
			console.error( `Cleaning up application runtime environment...` );
			await AppRuntime.CleanUp();
		}
		
		
		
		if ( SERVER.listening ) {
			console.error( `Terminating server...` );
			SERVER.close();
		}
		
		
		console.error( `Exiting...` );
		await process.cleanup();
		setTimeout(()=>process.exit(1));
	});
})().catch((e)=>setTimeout(()=>{throw e}));


function ParseURLPathDescriptor(url) {
	url = (url||'').trim();

	// NOTE: Parse hash
	let query, frag, pos = url.indexOf( '#' );
	if ( pos < 0 ) {
		frag = '';
	}
	else {
		frag = url.substring(pos);
		url = url.substring(0, pos);
	}
	
	// NOTE: Parse query
	pos = url.indexOf( "?" );
	if ( pos < 0 ) {
		query = '';
	}
	else {
		query = url.substring(pos);
		url = url.substring(0, pos);
	}
	
	return {path:url, query, fragment:frag};
}
