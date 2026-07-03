const SCOPE_ACTIVITY_FITNESS_READONLY = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly"
const SCOPE_HEALTH_METRICS_READONLY = "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly"

const loadFrame = document.getElementById("load_frame")
const loadLabel = loadFrame.querySelector("strong")

const stepsRadial = radialHelper(document.getElementById("steps_radial"))
const distanceRadial = radialHelper(document.getElementById("distance_radial"))
const activityRadial = radialHelper(document.getElementById("activity_radial"))
const pulseRadial = radialHelper(document.getElementById("pulse_radial"))

/**
 * @param {HTMLElement} radial The radial element to control
 */
function radialHelper(radial) {
	const bar = radial.querySelector(".radial-progress-bar")
	const label = radial.querySelector("h1")
	return (percent, text) => {
		bar.style.setProperty("--value", percent * 100)
		label.innerHTML = text
	}
}

/**
 * Converts a Date object into a Google Date
 * @param {Date} date The date to convert
 */
function getCivilDate(date) {
	return {
		year: date.getUTCFullYear(),
		month: date.getUTCMonth() + 1,
		day: date.getUTCDate()
	}
}

/**
 * Converts two Date objects into a Google CivilTimeInterval
 * @param {Date} start The starting Date
 * @param {Date} end The ending Date
 */
function getCivilTimeInterval(start, end) {
	return {
		start: { date: getCivilDate(start) },
		end: { date: getCivilDate(end) }
	}
}

/**
 * Creates a Google CivilTimeInterval from a Date Pivot and an offset in days
 * @param {Date} a The Date pivot
 * @param {number} count The number of days to offset. Can be negative
 */
function getDayInterval(a, count) {
	if (count > 0) {
		return {
			start: { date: getCivilDate(a) },
			end: { date: getCivilDate(new Date(a.getTime() + count * 86400000)), time: { hours: 23, minutes: 59 } }
		}
	} else {
		return {
			start: { date: getCivilDate(new Date(a.getTime() + count * 86400000)) },
			end: { date: getCivilDate(a), time: { hours: 23, minutes: 59 } }
		}
	}
}

function main() {
	loadLabel.innerText = "Requesting Data..."
	const batch = gapi.client.newBatch()
	const resource = {
		range: getDayInterval(new Date(), 0)
	}

	batch.add(gapi.client.health.users.dataTypes.dataPoints.dailyRollUp({
		parent: "users/me/dataTypes/steps",
		resource
	}), { id: "steps" })

	batch.add(gapi.client.health.users.dataTypes.dataPoints.dailyRollUp({
		parent: "users/me/dataTypes/distance",
		resource
	}), { id: "distance" })

	batch.add(gapi.client.health.users.dataTypes.dataPoints.dailyRollUp({
		parent: "users/me/dataTypes/active-minutes",
		resource
	}), { id: "activity" })

	batch.add(gapi.client.health.users.dataTypes.dataPoints.dailyRollUp({
		parent: "users/me/dataTypes/heart-rate",
		resource
	}), { id: "heartrate" })

	batch.then((response) => {
		let data

		const results = response.result
		if (!results) {
			loadLabel.innerText = "Failure"
			return
		}

		const steps = results.steps
		if (data = steps?.result?.rollupDataPoints) {
			if (data[0]) {
				stepsRadial(0.5, data[0].steps.countSum)
			} else {
				stepsRadial(0, "N/A")
			}
		} else {
			stepsRadial(0, "N/A")
		}

		const distance = results.distance
		if (data = distance?.result?.rollupDataPoints) {
			if (data[0]) {
				const mm = parseInt(data[0].distance.millimetersSum) * 0.001
				if (mm >= 1000) {
					distanceRadial(0.5, (mm * 0.001).toFixed(2) + ` <small style="font-size: 1rem;">km</small>`)
				} else {
					distanceRadial(0.5, mm + ` <small style="font-size: 1rem;">m</small>`)
				}
			} else {
				distanceRadial(0, "N/A")
			}
		} else {
			distanceRadial(0, "N/A")
		}

		const activity = results.activity
		if (data = activity?.result?.rollupDataPoints) {

		} else {
			activityRadial(0, "N/A")
		}

		const heartrate = results.heartrate
		if (data = heartrate?.result?.rollupDataPoints) {

		} else {
			pulseRadial(0, "N/A")
		}

		console.log(results)
		loadFrame.remove()
	}).catch((error) => {
		console.error(error)
	})
}

window.onload = () => {
	gapi.load("client", async () => {
		const token = localStorage.getItem("access_token")
		const exp = localStorage.getItem("exp")

		if (token && exp && exp > Date.now()) {
			gapi.client.setToken({
				access_token: token
			})

			await gapi.client.load("https://health.googleapis.com/$discovery/rest?version=v4")
			main()
		} else {
			const modal = new bootstrap.Modal('#signin_model')
			const signinButton = document.getElementById("signin_button")
			const tokenClient = google.accounts.oauth2.initTokenClient({
				client_id: "630310444486-1qlt8f3u2n35rglmtjbuc6vkcstavihh.apps.googleusercontent.com",
				scope: SCOPE_ACTIVITY_FITNESS_READONLY + " " + SCOPE_HEALTH_METRICS_READONLY,
				prompt: "",
				callback: (tokenResponse) => {
					console.log(tokenResponse)
					if (!tokenResponse?.access_token) {
						console.warn("No token response provided")
						signinButton.disabled = false
						signinButton.children[0].hidden = true
						signinButton.children[1].innerText = "Sign In"
						return
					}

					if (!google.accounts.oauth2.hasGrantedAllScopes(tokenResponse, SCOPE_ACTIVITY_FITNESS_READONLY)) {
						console.warn("Desired scopes have not been granted")
						signinButton.disabled = false
						signinButton.children[0].hidden = true
						signinButton.children[1].innerText = "Sign In"
						return
					}

					localStorage.setItem("access_token", tokenResponse.access_token)
					localStorage.setItem("exp", Date.now() + tokenResponse.expires_in * 1000)
					modal.hide()
					main()
				}
			})

			signinButton.onclick = () => {
				signinButton.disabled = true
				signinButton.children[0].hidden = false
				signinButton.children[1].innerText = "Signing In..."
				tokenClient.requestAccessToken()
			}

			gapi.client.load("https://health.googleapis.com/$discovery/rest?version=v4")
			modal.show()
		}
	})
}