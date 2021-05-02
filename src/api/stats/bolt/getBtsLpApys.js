const BigNumber = require('bignumber.js');
const { bscWeb3: web3 } = require('../../../utils/web3');

const BtsRewardPool = require('../../../abis/BtdRewardPool.json');
const fetchPrice = require('../../../utils/fetchPrice');
const pools = require('../../../data/boltBtsLpPools.json');
const { compound } = require('../../../utils/compound');
const { getTotalLpStakedInUsd } = require('../../../utils/getTotalStakedInUsd');
const { BASE_HPY, BSC_CHAIN_ID } = require('../../constants');
const getBlockNumber = require('../../../utils/getBlockNumber');

const getBtsLpApys = async () => {
  let apys = {};
  const btsRewardPool = '0x746274c5944008F96315D35e7381507b0C82A23C';

  let promises = [];
  pools.forEach(pool => promises.push(getPoolApy(btsRewardPool, pool)));
  const values = await Promise.all(promises);

  for (item of values) {
    apys = { ...apys, ...item };
  }

  return apys;
};

const getPoolApy = async (btsRewardPool, pool) => {
  const [yearlyRewardsInUsd, totalStakedInUsd] = await Promise.all([
    getYearlyRewardsInUsd(btsRewardPool, pool.poolId),
    getTotalLpStakedInUsd(btsRewardPool, pool),
  ]);

  const simpleApy = yearlyRewardsInUsd.dividedBy(totalStakedInUsd);
  const apy = compound(simpleApy, BASE_HPY, 1, 0.955);
  return { [pool.name]: apy };
};

const getYearlyRewardsInUsd = async (btsRewardPool, poolId) => {
  const currentBlock = await getBlockNumber(BSC_CHAIN_ID);
  const btsRewardPoolContract = new web3.eth.Contract(BtsRewardPool, btsRewardPool);

  let [blockRewards, totalAllocPoint] = await Promise.all([
    btsRewardPoolContract.methods.getGeneratedReward(currentBlock, currentBlock + 1).call(),
    btsRewardPoolContract.methods.totalAllocPoint().call(),
  ]);

  blockRewards = new BigNumber(blockRewards);
  totalAllocPoint = new BigNumber(totalAllocPoint);

  let { allocPoint } = await btsRewardPoolContract.methods.poolInfo(poolId).call();
  allocPoint = new BigNumber(allocPoint);

  const poolBlockRewards = blockRewards.times(allocPoint).dividedBy(totalAllocPoint);

  const secondsPerBlock = 3;
  const secondsPerYear = 31536000;
  const yearlyRewards = poolBlockRewards.dividedBy(secondsPerBlock).times(secondsPerYear);

  const btsPrice = await fetchPrice({ oracle: 'tokens', id: 'BTS' });
  const yearlyRewardsInUsd = yearlyRewards.times(btsPrice).dividedBy('1e18');

  return yearlyRewardsInUsd;
};

module.exports = getBtsLpApys;
