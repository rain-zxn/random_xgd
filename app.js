const ZEC_ADDRESS = "0xeB51D9A39AD5EEF215dC0Bf39a8821ff804A0F01";
const DAI_ADDRESS = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
const ROUTER_ADDRESS = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";

const POLYGON_CHAIN_ID = "0x89";
const MIN_AMOUNT = 27.1;
const MAX_AMOUNT = 27.9;

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

const ROUTER_ABI = [
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
    "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external",
    "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)"
];

let provider;
let signer;
let userAddress;
let currentRandomAmount = 0;

async function connectWallet() {
    try {
        if (typeof window.ethereum === 'undefined') {
            showStatus('Please install MetaMask or OKX Wallet!', 'error');
            return;
        }

        const accounts = await window.ethereum.request({ 
            method: 'eth_requestAccounts' 
        });
        
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        userAddress = accounts[0];

        const network = await provider.getNetwork();
        
        if (network.chainId !== 137) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: POLYGON_CHAIN_ID }],
                });
            } catch (switchError) {
                if (switchError.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: POLYGON_CHAIN_ID,
                            chainName: 'Polygon Mainnet',
                            nativeCurrency: {
                                name: 'MATIC',
                                symbol: 'MATIC',
                                decimals: 18
                            },
                            rpcUrls: ['https://polygon-rpc.com/'],
                            blockExplorerUrls: ['https://polygonscan.com/']
                        }]
                    });
                } else {
                    throw switchError;
                }
            }
        }

        await updateUI();
        
        document.getElementById('connect-wallet').textContent = 'Connected';
        document.getElementById('connect-wallet').disabled = true;
        document.getElementById('sell-button').disabled = false;
        
        showStatus('Wallet connected successfully!', 'success');
    } catch (error) {
        console.error('Wallet connection failed:', error);
        showStatus('Wallet connection failed: ' + error.message, 'error');
    }
}

async function updateUI() {
    try {
        document.getElementById('wallet-address').textContent = 
            userAddress.substring(0, 6) + '...' + userAddress.substring(38);
        
        const network = await provider.getNetwork();
        document.getElementById('network').textContent = 
            network.chainId === 137 ? 'Polygon' : `Chain ID: ${network.chainId}`;

        const zecContract = new ethers.Contract(ZEC_ADDRESS, ERC20_ABI, provider);
        const balance = await zecContract.balanceOf(userAddress);
        const decimals = await zecContract.decimals();
        const formattedBalance = ethers.utils.formatUnits(balance, decimals);
        
        document.getElementById('zec-balance').textContent = 
            parseFloat(formattedBalance).toFixed(4) + ' ZEC';
    } catch (error) {
        console.error('UI update failed:', error);
    }
}

function generateRandomAmount() {
    currentRandomAmount = (Math.random() * (MAX_AMOUNT - MIN_AMOUNT) + MIN_AMOUNT).toFixed(4);
    document.getElementById('random-amount').textContent = currentRandomAmount;
    showStatus(`Random amount generated: ${currentRandomAmount} ZEC`, 'info');
}

async function sellZEC() {
    try {
        if (!currentRandomAmount || currentRandomAmount === 0) {
            showStatus('Please generate random amount first!', 'error');
            return;
        }

        showStatus('Preparing transaction parameters...', 'info');
        document.getElementById('sell-button').disabled = true;

        const zecContract = new ethers.Contract(ZEC_ADDRESS, ERC20_ABI, signer);
        const zecDecimals = await zecContract.decimals();
        const amountIn = ethers.utils.parseUnits(currentRandomAmount.toString(), zecDecimals);

        const routerContract = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
        
        const amountOutMin = ethers.utils.parseUnits('0', 18);

        const path = [ZEC_ADDRESS, DAI_ADDRESS];
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

        displayTxParams(amountIn, amountOutMin, path, userAddress, deadline);

        const populatedTx = await routerContract.populateTransaction.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            amountOutMin,
            path,
            userAddress,
            deadline
        );

        document.getElementById('tx-calldata').value = populatedTx.data;

        showStatus('Processing transaction...', 'info');

        const tx = await routerContract.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            amountOutMin,
            path,
            userAddress,
            deadline,
            {
                gasLimit: 300000
            }
        );

        showStatus('Transaction submitted, waiting for confirmation...', 'info');
        const receipt = await tx.wait();

        showStatus(
            `Transaction successful! Sold ${currentRandomAmount} ZEC<br>` +
            `Transaction hash: ${receipt.transactionHash}`,
            'success'
        );

        await updateUI();
        currentRandomAmount = 0;
        document.getElementById('random-amount').textContent = '--';
        
    } catch (error) {
        console.error('Transaction failed:', error);
        let errorMessage = 'Transaction failed: ';
        
        if (error.code === 4001) {
            errorMessage += 'User rejected transaction';
        } else if (error.message && error.message.includes('insufficient funds')) {
            errorMessage += 'Insufficient balance';
        } else if (error.reason) {
            errorMessage += error.reason;
        } else if (error.message) {
            const shortMessage = error.message.substring(0, 200);
            errorMessage += shortMessage + (error.message.length > 200 ? '...' : '');
        } else {
            errorMessage += 'Unknown error';
        }
        
        showStatus(errorMessage, 'error');
    } finally {
        document.getElementById('sell-button').disabled = false;
    }
}

function displayTxParams(amountIn, amountOutMin, path, to, deadline) {
    document.getElementById('tx-amount-in').textContent = amountIn.toString();
    document.getElementById('tx-amount-out-min').textContent = amountOutMin.toString();
    document.getElementById('tx-path').textContent = JSON.stringify(path, null, 2);
    document.getElementById('tx-to').textContent = to;
    document.getElementById('tx-deadline').textContent = deadline + ' (' + new Date(deadline * 1000).toLocaleString() + ')';
    
    document.getElementById('tx-params-section').style.display = 'block';
}

function showStatus(message, type) {
    const statusSection = document.getElementById('status-section');
    const statusMessage = document.getElementById('status-message');
    
    statusMessage.innerHTML = message;
    statusMessage.className = `status-message ${type}`;
    statusSection.style.display = 'block';
    
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            statusSection.style.display = 'none';
        }, 10000);
    }
}

document.getElementById('connect-wallet').addEventListener('click', connectWallet);
document.getElementById('generate-amount').addEventListener('click', generateRandomAmount);
document.getElementById('sell-button').addEventListener('click', sellZEC);

if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            location.reload();
        } else {
            userAddress = accounts[0];
            updateUI();
        }
    });

    window.ethereum.on('chainChanged', () => {
        location.reload();
    });
}
