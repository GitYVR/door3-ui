import ResponsiveAppBar from "./components/ResponsiveAppBar";
import { useCallback, useEffect, useState } from "react";
import { useSnackbar } from "notistack";
import { useSigner, useNetwork } from "wagmi";

import { Grid, Typography, Button, LinearProgress } from "@mui/material";
import { BigNumber, Contract, ethers } from "ethers";

import erc20Abi from "./abi/ERC20.json";
import door3Abi from "./abi/Door3.json";

const DOOR3_ADDRESS = "0x46d2495aa0329866A9ACd808634e27318674f31B";

const isEpochPassed = (t: number) => {
  return t * 1000 < new Date().getTime();
};

function App() {
  const { data: signer } = useSigner();
  const { chain } = useNetwork();
  const { enqueueSnackbar } = useSnackbar();

  const [tokenName, setTokenName] = useState<null | string>(null);
  const [tokenDec, setTokenDec] = useState<null | BigNumber>(null);
  const [tokenBalance, setTokenBalance] = useState<null | BigNumber>(null);
  const [tokensPerDay, setTokensPerDay] = useState<null | BigNumber>(null);
  const [minDaysPurchased, setMinDaysPurchased] = useState<null | BigNumber>(
    null
  );
  const [userExpiry, setUserExpiry] = useState<null | BigNumber>(null);

  const [isBuying, setIsBuying] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

  const [tokenContract, setTokenContract] = useState<null | Contract>(null);
  const [door3Contract, setDoor3Contract] = useState<null | Contract>(null);

  const getInfo = useCallback(async () => {
    if (signer === null || signer === undefined) return;
    if (door3Contract === null || tokenContract === null) return;
    const userAddress = signer.getAddress();
    const [tn, dec, bal, expiry, tpd, mdp] = await Promise.all([
      tokenContract.symbol(),
      tokenContract.decimals(),
      tokenContract.balanceOf(userAddress),
      door3Contract.expiry(userAddress),
      door3Contract.tokensPerDay(),
      door3Contract.minDaysPurchased(),
    ]);

    setTokenName(tn);
    setTokenDec(dec);
    setTokenBalance(bal);
    setUserExpiry(expiry);
    setTokensPerDay(tpd);
    setMinDaysPurchased(mdp);
  }, [door3Contract, signer, tokenContract]);

  const getContratsAndInfo = useCallback(async () => {
    if (signer === null || signer === undefined) return;

    const d3C = new ethers.Contract(DOOR3_ADDRESS, door3Abi, signer);
    const tokenAddress = await d3C.token();
    const tc = new ethers.Contract(tokenAddress, erc20Abi, signer);

    setDoor3Contract(d3C);
    setTokenContract(tc);
  }, [signer]);

  useEffect(() => {
    if (tokenContract === null || door3Contract === null) return;
    getInfo();
  }, [tokenContract, door3Contract, getInfo]);

  useEffect(() => {
    if (
      (signer === null || signer === undefined) &&
      (door3Contract !== null || tokenContract !== null)
    ) {
      setDoor3Contract(null);
      setTokenContract(null);
    }

    if (signer === null) return;

    if (door3Contract !== null && tokenContract !== null) return;

    getContratsAndInfo();
  }, [signer, door3Contract, tokenContract, getContratsAndInfo]);

  return (
    <>
      <ResponsiveAppBar />

      <Grid
        container
        marginTop={2}
        spacing={0}
        direction="column"
        alignItems="center"
        justifyContent="center"
      >
        <Grid item xs={1} md={3} />
        <Grid item xs={10} md={6}>
          {signer === undefined ||
            (signer === null && (
              <Typography variant="h5">Please connect your wallet</Typography>
            ))}
          {signer !== undefined &&
            signer !== null &&
            userExpiry === null &&
            (chain === null ||
            chain === undefined ||
            (chain && chain.id !== 137) ? (
              <Typography variant="h5">
                Unsupported chain, please change to Polygon Network
              </Typography>
            ) : (
              <>
                <Typography variant="h5">
                  Retrieving Door3 membership status
                </Typography>
                <LinearProgress style={{ marginTop: "10px" }} />
              </>
            ))}
          {signer !== undefined && signer !== null && userExpiry !== null && (
            <>
              <Typography variant="h5">
                Door3 Membership:{" "}
                <span
                  style={{
                    color: isEpochPassed(userExpiry.toNumber())
                      ? "red"
                      : "green",
                  }}
                >
                  {isEpochPassed(userExpiry.toNumber()) ? "Inactive" : "Active"}
                </span>
              </Typography>

              {isEpochPassed(userExpiry.toNumber()) ? (
                <></>
              ) : (
                <Typography variant="subtitle2">
                  Ends {new Date(userExpiry.toNumber() * 1000).toLocaleString()}
                </Typography>
              )}
              <Button
                onClick={async () => {
                  if (
                    signer === null ||
                    signer === undefined ||
                    door3Contract === null ||
                    tokenContract === null ||
                    tokensPerDay === null ||
                    minDaysPurchased === null ||
                    tokenBalance === null
                  )
                    return;
                  setIsBuying(true);
                  const sendAmount = tokensPerDay.mul(minDaysPurchased);

                  if (tokenBalance.lt(sendAmount)) {
                    enqueueSnackbar("Not enough funds", { variant: "warning" });
                    setIsBuying(false);
                    return;
                  }

                  const userAddress = signer.getAddress();
                  const approval = await tokenContract.allowance(
                    userAddress,
                    door3Contract.address
                  );

                  if (approval.lt(sendAmount)) {
                    enqueueSnackbar("Approving token", { variant: "info" });
                    try {
                      const tx = await tokenContract.approve(
                        door3Contract.address,
                        ethers.constants.MaxUint256
                      );
                      await tx.wait();
                      enqueueSnackbar("Token approved", { variant: "success" });
                    } catch (e) {
                      enqueueSnackbar("Token approval failed", {
                        variant: "error",
                      });
                      setIsBuying(false);
                      return;
                    }
                  }

                  enqueueSnackbar("Buying membership...", { variant: "info" });
                  try {
                    const tx = await door3Contract.donate(sendAmount);
                    await tx.wait();
                    enqueueSnackbar("Membership purchased", {
                      variant: "success",
                    });
                  } catch (e) {
                    enqueueSnackbar("Membership purchase failed", {
                      variant: "error",
                    });
                  }

                  getInfo();
                  setIsBuying(false);
                }}
                disabled={isBuying || tokensPerDay === null}
                style={{ marginTop: "10px" }}
                variant="contained"
                fullWidth
              >
                Buy{" "}
                {minDaysPurchased === null ? "--" : minDaysPurchased.toString()}{" "}
                day membership (
                {minDaysPurchased !== null &&
                tokensPerDay !== null &&
                tokenDec !== null
                  ? ethers.utils.formatUnits(
                      minDaysPurchased.mul(tokensPerDay),
                      tokenDec
                    ) + ` ${tokenName}`
                  : "--"}
                )
              </Button>
              {userExpiry !== null && !isEpochPassed(userExpiry.toNumber()) && (
                <Button
                  disabled={isOpening}
                  onClick={async () => {
                    if (signer === null || signer === undefined) return;
                    setIsOpening(true);

                    const payload = JSON.stringify({
                      timestamp: new Date().getTime(),
                      message: "Open Door3",
                    });

                    try {
                      const signature = await signer.signMessage(payload);
                      enqueueSnackbar("Opening door", { variant: "info" });
                      const resp = await fetch(
                        `https://api-door3.dctrl.wtf/members/open`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            payload,
                            signature,
                          }),
                        }
                      ).then((x) => x.json());
                      if (resp.error) {
                        enqueueSnackbar("Cannot open door", {
                          variant: "error",
                        });
                      } else {
                        enqueueSnackbar("Door opened", { variant: "success" });
                      }
                    } catch (e) {
                      enqueueSnackbar("Cannot open door", { variant: "error" });
                    }
                    setIsOpening(false);
                  }}
                  style={{ marginTop: "10px" }}
                  fullWidth
                  variant="contained"
                  color="success"
                >
                  Open door
                </Button>
              )}
            </>
          )}
        </Grid>
        <Grid item xs={1} md={3} />
      </Grid>
    </>
  );
}

export default App;
