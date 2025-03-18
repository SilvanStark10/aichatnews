function fetchUserIPAddresses() {
    return Promise.all([
        fetch('https://api.ipify.org?format=json').then(response => response.json()),
        fetch('https://api6.ipify.org?format=json').then(response => response.json())
    ]).then(([ipv4Data, ipv6Data]) => {
        return {
            userIpV4: ipv4Data.ip,
            userIpV6: ipv6Data.ip
        };
    }).catch(error => {
        console.error('Error fetching IP addresses:', error);
        return { userIpV4: null, userIpV6: null }; // Return nulls in case of erro
    });
}
