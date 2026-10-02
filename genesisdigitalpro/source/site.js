window.GDP=window.GDP||{};
GDP.track=function(event,data){try{window.dispatchEvent(new CustomEvent('gdp:'+event,{detail:data||{}}))}catch(e){}};
GDP.consent={analytics:false,marketing:false};
