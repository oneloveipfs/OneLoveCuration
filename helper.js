const config = require('./config')
const hive = require('@hiveio/hive-js')
const steem = require('steem')
const blurt = require('@blurtfoundation/blurtjs')
const asyncjs = require('async')
const javalon = require('javalon')
const fetch = require('node-fetch')

let database = require('mysql').createConnection(config.database);

database.connect((err) => {
    if (err) throw err;
    console.log("Database connection etablished!");
    database.query("set session sql_mode='STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';", () => {
        console.log("Initialized Database")
    })
});

database.addMessage = async (id, author, permlink) => {
    return new Promise((resolve, reject) => {
        let sql = "INSERT INTO message (discord_id, author, permlink, posted) VALUES (?,?,?,?)";
        database.query(sql, [id, author, permlink, (new Date()).toISOString().slice(0, 19).replace('T', ' ')], (err, result) => {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                resolve(true);
            }
        })
    })
};

database.getMessageSummary = async(days) => {
    return new Promise((resolve, reject) => {
        let sql = "select Count(id) as count, posted from message m WHERE m.posted > CURDATE() - INTERVAL ? DAY GROUP BY Day(m.posted);";
        database.query(sql,[days], (err, result) => {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                resolve(result.reverse());
            }
        })
    })
};

database.getMessagesToVote = async () => {
    return new Promise((resolve, reject) => {
        let sql = "SELECT * FROM message WHERE voted = 0";
        database.query(sql, (err, result) => {
            if (err) {
                reject(err);
                console.log(err);
            } else {
                resolve(result);
            }
        })
    })
}

database.newUserSignupOnDiscord = async (discord_id) => {
    return new Promise((resolve, reject) => {
        let onetime_token = Math.floor(Math.random() * (99999999999 - 10000000000 + 1)) + 10000000000;
        let sql = "INSERT INTO users (discord_id, onetime_token) VALUES (?, ?);";
        database.query(sql, [discord_id, onetime_token], (err, result) => {
        if (err) {
          reject(err);
          console.log(err);
        } else {
          resolve(onetime_token);
       }
      })
    })
}

database.checkIfUserExist = (discord_id) => {
  return new Promise((resolve, reject) => {
    let sql = "SELECT onetime_token FROM users WHERE discord_id = ?;";
    database.query(sql, [discord_id], (err, result) => {
       if (err) {
          console.log(err);
          reject(err);
       } else if (result.length == 1) {
          let exists = true;
          resolve(result[0].onetime_token);
       } else if (result.length == 0) {
          let exists = false;
          let onetime_token = false;
          resolve(false);
       }
    })
  }).then((onetime_token) => { if (onetime_token == false) {return database.newUserSignupOnDiscord(discord_id)} else {return onetime_token}; });
}

database.verifyUserOnDtube = async (discord_id, dtube_account) => {
  let onetime_token = await database.checkIfUserExist(discord_id);
  let r = false;
  if(onetime_token!=false) {
      let accountJSON = await apis.getAvalonAccount(dtube_account);
      if (typeof accountJSON.json != 'undefined') {
          let accountLocation = accountJSON.json.profile.location;
          if(accountLocation == onetime_token) {
              let block_height = await apis.getAvalonBlockchainHeight();
              let sql = "UPDATE users SET dtube_username=?, verification_block=? WHERE discord_id=? AND dtube_username IS NULL;";
              return await database.query(sql, [dtube_account, block_height.count, discord_id], (err, result) => {
                  if (err) {
                      r = err;
                      console.log(err);
                  } else {
                      return true;
                  }
              });
          }
      }
  }
  return r;
};


database.getMessage = async (author, permlink) => {
    return new Promise((resolve, reject) => {
        let sql = "SELECT * FROM message where author = ? and permlink = ?";
        database.query(sql, [author, permlink], (err, result) => {
            if (err) {
                reject(err);
                console.log(err);
            } else {
                if (result.length != 1)
                    resolve(null)
                else
                    resolve(result[0]);
            }
        })
    })
};

database.getMessages = async () => {
    return new Promise((resolve, reject) => {
        let sql = "SELECT * FROM message";
        database.query(sql, (err, result) => {
            if (err) {
                reject(err);
                console.log(err);
            } else {
                resolve(result);
            }
        })
    })
};

database.countMessages = async () => {
    return new Promise((resolve, reject) => {
        let sql = "SELECT Count(id) as count FROM message";
        database.query(sql, (err, result) => {
            if (err) {
                reject(err);
                console.log(err);
            } else {
                resolve(result);
            }
        })
    })
}

database.existMessage = async (author, permlink) => {
    let message = await database.getMessage(author, permlink);
    return new Promise((resolve, reject) => {
        if (!message) resolve(false);
        else resolve(true)
    })
};

database.updateReactions = async (id, reactions) => {
    return new Promise((resolve, reject) => {
        let sql = "UPDATE message SET ? WHERE voted = 0 and discord_id = " + id;
        database.query(sql, reactions, (err, result) => {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                resolve(true);
            }
        })
    })
};

database.feedBackExist = async (author, permlink) => {
    return new Promise((resolve, reject) => {
        let sql = "SELECT * from feedback where author = ? and permlink = ?";
        database.query(sql, [author, permlink], (err, result) => {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                resolve(result);
            }
        })
    });
};

database.addFeedback = async (from, msg, author, permlink) => {
    let sql = "INSERT INTO feedback (discord,message,author,permlink) VALUES (?,?,?,?)";
    return new Promise((resolve, reject) => {
        database.query(sql, [from, msg, author, permlink], (err, result) => {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                resolve(true);
            }
        })
    })
}

const apis = {
    getAccount: (account,network) => {
        return new Promise((rs,rj) => apis.strToAPI(network).api.getAccounts([account],(e,r) => {
            if (e) return rj(e)
            rs(r)
        }))
    },
    getAvalonAccount: (account) => {
        return new Promise((rs,rj) => javalon.getAccount(account,(e,r) => {
            if (e) return rj(e)
            rs(r)
        }))
    },
    getAvalonBlockchainHeight: () => {
        return new Promise((rs,rj) => javalon.getBlockchainHeight((e,r) => {
            if (e) return rj(e)
            rs(r)
        }))
    },
    getAvalonContent: (name,link) => {
        return new Promise((rs,rj) => javalon.getContent(name,link,(e,r) => {
            if (e) return rj(e)
            rs(r)
        }))
    },
    getPower: (account,network) => {
        return new Promise(async (rs,rj) => {
            let sp = await apis.strToAPI(network).api.getAccountsAsync([account])
            let props = await apis.strToAPI(network).api.getDynamicGlobalPropertiesAsync()
            sp = sp[0]
            rs(apis.strToAPI(network).formatter[network === 'hive' ? 'vestToHive' : 'vestToSteem'](parseFloat(sp.vesting_shares) + parseFloat(sp.received_vesting_shares) - parseFloat(sp.delegated_vesting_shares), props.total_vesting_shares, props['total_vesting_fund_'+network]))
        })
    },
    getVotingMana: (account,network) => {
        return new Promise(async (rs,rj) => {
            let acc = await apis.getAccount(account,network)
            let secondsago = (new Date - new Date(acc[0].last_vote_time + 'Z')) / 1000
            var mana = acc[0].voting_power + (10000 * secondsago / 432000)
            mana = Math.min(mana/100,100).toFixed(2)
            rs(mana)
        })
    },
    getAvalonVP: async (account) => {
        return new Promise(async (rs,rj) => {
            try {
                let acc = await apis.getAvalonAccount(account)
                rs(javalon.votingPower(acc))
            } catch (e) {
                return rj(e)
            }
        })
    },
    getManas: async (dtc,stm,hve,blt) => {
        return new Promise(async (rs,rj) => {
            let result = {}
            if (dtc)
                result.avalon = await apis.getAvalonVP(dtc)
            if (stm)
                result.steem = await apis.getVotingMana(stm,'steem')
            if (hve)
                result.hive = await apis.getVotingMana(hve,'hive')
            if (blt)
                result.blurt = await apis.getVotingMana(blt,'blurt')
            rs(result)
        })
    },
    strToAPI: (network) => {
        switch (network) {
        case 'steem':
            return steem
        case 'hive':
            return hive
        case 'blurt':
            return blurt
        default:
            throw new Error('network does not exist')
        }
    }
}

const graphOps = {
    vote: (author,link,weight,network) => {
        return ['vote',{
            voter: config[network].account,
            author: author,
            permlink: link,
            weight: Math.min(weight,10000)
        }]
    },
    reblog: (author,link) => {
        return ['custom_json',{
            required_auths: [],
            required_posting_auths: [config.resteem.account],
            id: 'follow',
            json: JSON.stringify(['reblog',{
                account: config.resteem.account,
                author: author,
                permlink: link
            }])
        }]
    }
}

function uppercasefirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

function calculateVote(client,post,efficiency) {

    let weight = 0
    let count = countReaction(post);

    // add up all the weights
    if (count.one_hundred >= 3)
        return 10000 * efficiency
    for (let i = 0; i < count.game_die; i++)
        if(post.sender != client.user.id)
            weight += 100 * Math.floor(Math.random()*(12-2+1)+2)
    for (let i = 0; i < count.heart; i++)
        if(post.sender != client.user.id)
            weight += 3000
    for (let i = 0; i < count.up; i++)
        if(post.sender != client.user.id)
            weight += 1500
    for (let i = 0; i < count.down; i++)
        if(post.sender != client.user.id)
            weight -= 1500

    // if there is a disagrement, no vote
    if (weight > 0 && post.down > 0)
        return 0
    
    // maximum voting weight possible is 100%
    if (weight * efficiency > 10000) {
        return 10000
    } else if (weight < 0) {
        return weight
    } else {
        return weight * efficiency
    }
}

function countReaction(message) {
    let reactions = {}
    for (const key in config.discord.curation.curation_emojis) {
        reactions[key] =
            message.reactions.cache.get(config.discord.curation.curation_emojis[key]) ?
                message.reactions.cache.get(config.discord.curation.curation_emojis[key]).count
                : 0;
        reactions[key] = reactions[key] -1;
    }
    
    return reactions;
}

function getVoteValue(weight,voter,network,completion) {
    asyncjs.parallel({
        rewardPool: (cb) => {
            apis.strToAPI(network).api.getRewardFund('post',(err,res) => cb(err,res))
        },
        account: (cb) => {
            apis.strToAPI(network).api.getAccounts([voter],(err,res) => cb(err,res))
        },
        priceFeed: (cb) => {
            if (network == 'blurt')
                fetch('https://ionomy.com/api/v1/public/market-summary?market=btc-blurt').then(res => {return res.json()}).then(blurtPrice => {
                    fetch('https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=true&market_data=true&community_data=false&developer_data=false&sparkline=false').then(res => {return res.json()}).then(btcprice => {
                        let blurtUsd = parseFloat(blurtPrice.data.price) * btcprice.market_data.current_price.usd
                        return cb(null,{base: blurtUsd.toFixed(3) + ' BBD', quote: '1.000 BLURT'})
                    })
                })
            else apis.strToAPI(network).api.getCurrentMedianHistoryPrice((err,res) => cb(err,res))
        }
    },(errors,results) => {
        // TODO: Convergence linear curve
        if (errors) return completion(errors,null)
        let secondsago = (new Date - new Date(results.account[0].last_vote_time + 'Z')) / 1000
        var mana = results.account[0].voting_power + (10000 * secondsago / 432000)
        mana = Math.min(mana/100,100).toFixed(2)
        let feed = Number(results.priceFeed.base.split(' ')[0]) / Number(results.priceFeed.quote.split(' ')[0])
        let total_vests = Number(results.account[0].vesting_shares.slice(0,-6)) - Number(results.account[0].delegated_vesting_shares.slice(0,-6)) + Number(results.account[0].received_vesting_shares.slice(0,-6))
        let final_vest = total_vests * 1e6
        let power = (mana * weight / 10000) / 50
        let rshares = power * final_vest / 10000
        let estimate = rshares / Number(results.rewardPool.recent_claims) * Number(results.rewardPool.reward_balance.slice(0,-6)) * feed * 100
        completion(null,estimate)
    })
}

const thousandSeperator = (num) => {
    let num_parts = num.toString().split(".")
    num_parts[0] = num_parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    return num_parts.join(".")
}

const getRechargeTime = (currentMana, manaToGetRecharged) => {
    // Calculate recharge time to threshold mana
    let rechargeTimeMins = (manaToGetRecharged - currentMana) / (5/6)
    let rechargeTimeHours = 0
    while(rechargeTimeMins > 1) {
        rechargeTimeHours = rechargeTimeHours + 1
        rechargeTimeMins = rechargeTimeMins - 1
    }
    rechargeTimeMins = rechargeTimeMins * 60

    let rechargeTime = ''
    if (rechargeTimeHours > 0)
        rechargeTime += rechargeTimeHours + ' hrs '
    rechargeTime += Math.floor(rechargeTimeMins) + ' mins'
    return rechargeTime
}

const nextMilestone = (num) => {
    return Math.pow(10,num.toString().length)
}

const getRechargeTimeAvalon = (account, vpThreshold) => {
    let currentVp = javalon.votingPower(account)
    let result = ''
    let thresholdMet = false
    let threshold2 = 0
    if (currentVp >= vpThreshold) {
        thresholdMet = true
        threshold2 = vpThreshold
        vpThreshold = nextMilestone(vpThreshold)
    }
    let hour = (vpThreshold - currentVp) / (account.balance / 100)
    let mins = Math.ceil((hour - Math.floor(hour)) * 60)
    if (hour > 0)
        result += Math.floor(hour) + ' hrs '
    result += mins + ' mins'
    if (thresholdMet)
        result += ' to reach ' + thousandSeperator(nextMilestone(threshold2)) + ' VP'
    else
        result += ' to reach curation threshold'
    return result
}

function generatePermlink() {
    let permlink = ""
    let possible = "abcdefghijklmnopqrstuvwxyz0123456789"
    for (let i = 0; i < 8; i++)
        permlink += possible.charAt(Math.floor(Math.random() * possible.length))
    return permlink
}

module.exports = {
    DTubeLink: (str) => {
        let words = str.split(' ')
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (word.startsWith('https://d.tube') || word.startsWith('https://dtube.techcoderx.com'))
                return word
        }
    },
    apis,
    calculateVote,
    countReaction,
    getMinutesSincePost: (posted) => {
        let diff = (new Date()).getTime() - posted.getTime();
        return (diff / 60000);
    },
    getVoteValue,
    getRechargeTimeAvalon,
    generatePermlink,
    needsRecharge: (manas) => {
        let result = {}
        for (let net in manas) {
            if (typeof manas[net] == 'string')
                manas[net] = parseFloat(manas[net])
            if (manas[net] < config[net].threshold)
                result[net] = true
            else
                manas[net] = false
        }
        return result
    },
    meetsThreshold: () => {
        return new Promise(async (rs,rj) => {
            let avalonVp = await apis.getAvalonVP(config.avalon.account)
            rs(avalonVp >= config.avalon.threshold)
        })
    },
    rechargeTimes: (manas, type) => {
        let result = {}
        for (let net in manas) {
            if (typeof manas[net] == 'string')
                manas[net] = parseFloat(manas[net])
            if (manas[net] < config[net].threshold && type == 0 && net != 'avalon') // Type 0: up to threshold
                result[net] = getRechargeTime(manas[net],config[net].threshold)
            else if (type == 1 && net != 'avalon' && manas[net] < 100)
                result[net] = getRechargeTime(manas[net],100)
        }
        return result
    },
    thousandSeperator,
    uppercasefirst,
    vote: async (message, client, efficiency) => {
        return new Promise(async (resolve, reject) => {
            let post = await client.guilds.cache.get(config.discord.curation.guild)
                .channels.cache.get(config.discord.curation.channel)
                .messages.cache.get(message.discord_id)
            await database.updateReactions(post.id, countReaction(post))
            let weight = calculateVote(client, post, efficiency);
            if (weight === 0)
                return reject('Weight=0')

            // voting on avalon
            let currentAvalonVP = await apis.getAvalonVP(config.avalon.account)
            let vpToSpend = Math.floor((weight / 10000) * (config.avalon.vpMultiplier / 100) * currentAvalonVP)
            if (vpToSpend < 1) vpToSpend = 1

            console.log('voting', message.author + '/' + message.permlink, weight, vpToSpend)

            var newTx = {
                type: javalon.TransactionType.VOTE,
                data: {
                    author: message.author,
                    link: message.permlink,
                    vt: vpToSpend,
                    tag: config.avalon.tag
                }
            }
            
            newTx = javalon.sign(config.avalon.wif, config.avalon.account, newTx)

            javalon.sendRawTransaction(newTx, function(err, res) {
                if (!err) {
                    let sql = "UPDATE message SET voted = 1, vote_weight = ?, vp_spent = ? WHERE author = ? and permlink = ?";
                    database.query(sql, [weight, vpToSpend, message.author, message.permlink], (err, result) => {
                        console.log("Voted with " + (weight / 100) + "% for @" + message.author + '/' + message.permlink);
                        resolve(result);
                    })
                } else {
                    return reject('Avalon vote error' + JSON.stringify(err))
                }
            })

            // Graphene votes
            let content = await apis.getAvalonContent(message.author, message.permlink)
            let manas = await apis.getManas(null,config.steem.account,config.hive.account,config.blurt.account)
            let voted = []
            if (content.json && content.json.refs) for (let i = 0; i < content.json.refs.length; i++) {
                let ref = content.json.refs[i].split('/')
                if ((ref[0] == 'steem' && !voted.includes('steem') && parseFloat(manas.steem) >= config.steem.threshold) ||
                    (ref[0] == 'hive' && !voted.includes('hive') && parseFloat(manas.hive) >= config.hive.threshold) ||
                    (ref[0] == 'blurt' && !voted.includes('blurt') && parseFloat(manas.blurt) >= config.blurt.threshold)) {
                    voted.push(ref[0])
                    let ops = [graphOps.vote(ref[1],ref[2],weight,ref[0])]
                    let wifs = [config[ref[0]].wif]
                    
                    if (weight >= config.resteem.threshold) {
                        // Resteem post if voting weight is high enough
                        ops.push(graphOps.reblog(ref[1],ref[2]))
                    
                        if (config.resteem.wif !== config[ref[0]].wif)
                            wifs.push(config.resteem.wif)
                    }
                    
                    apis.strToAPI(ref[0]).broadcast.send({ extensions: [], operations: ops },wifs,(err) => {
                        if (err)
                            console.log(ref[0] + " error: " + err);
                    })
                }
            }
        })
    },
    database
};
