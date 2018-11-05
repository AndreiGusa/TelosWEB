import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatTableDataSource } from '@angular/material';
import { forkJoin } from "rxjs/observable/forkJoin";
import { MainService } from '../../services/mainapp.service';
import { Socket } from 'ng-socket-io';
import { Observable, Subscription } from '../../../../node_modules/rxjs';
import { tileLayer, latLng, marker, circle, polygon } from 'leaflet';

@Component({
  selector: 'producers-page',
  templateUrl: './producers.component.html',
  styleUrls: ['./producers.component.css']
})
export class ProducersPageComponent implements OnInit, OnDestroy {
  private reloadDateSubscription: Subscription;

  ROTATION_INTERVAL: number = 6 * 60 * 60 * 1000; //every 6 hours
  DATA_RELOAD: number = 60 * 2000; //every 2 minutes

  mainData;
  spinner = false;
  displayedColumns = ['#', 'Name', 'Status', 'Url', 'Last block', 'Last time produced', 'Next rotation', 'Votes'];
  dataSource;
  eosToInt = Math.pow(10, 13);
  totalProducerVoteWeight;
  sortedArray;
  votesToRemove;
  supply;
  blockChainInfo;
  lastProducerIndex = -1;
  voteProgression;
  rotations;
  nextRotation$: Observable<number>;
  nextRotationMessage;
  firstBlockProduced;
  producersSavedInfo: any = {};
  mapOpen: boolean = false;
  topProducers: any = {};

  options;
  layers = [];
  lastMapUpdate = [];
  rotationMark:any = {};

  _colors:any = {
    'Active':"#00ff00",
    'Standby':"#ffffff",
    'Candidate':"#3333cc",
    'Inactive':"#000000",
    'Producing':"#ff0000"
  };
  _reverseMap:any = {};

  constructor(private socket: Socket, protected http: HttpClient, private MainService: MainService) { }

  ngOnInit() {
    this.getBlockData();

    this.reloadDateSubscription = Observable.interval(this.DATA_RELOAD)
      .subscribe((val) => {
        this.getBlockData();
      });

    this.socket.on('get_info', res => {
      this.blockChainInfo = res;
      this.setProducingInfo();
    });
  }

  ngOnDestroy() {
    if (this.reloadDateSubscription)
      this.reloadDateSubscription.unsubscribe();
  }

  showMap(){
    this.options = {
      layers: [
         tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 18, attribution: 'Telos' })
      ],
      zoom: 1.2,
      center: latLng(0, 0)
    };
    this.mapOpen = !this.mapOpen;
  }

  putProducersOnMap(producers){
    if(this.lastMapUpdate.length){
      this.layers.splice(this.lastMapUpdate[0], this.lastMapUpdate[1]);
    }
    this.lastMapUpdate[0] = this.layers.length;
    this.lastMapUpdate[1] = 0;
    for(let i = 0; i < producers.length && i < 51; i++){
      if(!producers[i].geoLocation) continue;

      producers[i].mapNode = circle(producers[i].geoLocation, { radius: 1000, color: this._colors[producers[i].label] || this._colors.Producing });
      producers[i].mapNode.bindPopup(producers[i].owner);

      this.layers.push(producers[i].mapNode);
      this.lastMapUpdate[1]++;
    }
  }

  getBlockData() {
    this.spinner = true;
    let producers = this.http.get(`/api/v1/get_producers/0/60`);
    // let producers = this.http.get(`/api/custom/get_table_rows/eosio/eosio/producers/500`);
    let global = this.http.get(`/api/v1/get_table_rows/eosio/eosio/global/1`);
    let stat = this.http.get(`/api/v1/get_table_rows/eosio.token/TLOS/stat/1`);
    let rotations = this.http.get('/api/v1/get_table_rows/eosio/eosio/rotations/1')
    // let schedule = this.http.get('/api/custom/get_producer_schedule');

    forkJoin([producers, global, stat, rotations])
      .subscribe(
        (results: any) => {
          const producers = results[0];
          const global = results[1];
          const stat = results[2];
          const rotations = results[3];

          this.mainData = producers.list.filter(p=>p.is_active);

          if (this.producersSavedInfo) {
            this.mainData.forEach((element, index) => {
              if(this.topProducers[element.owner]){
                this.mainData[index].total_votes += 1;
              }
              if (this.producersSavedInfo[element.owner]) {
                this.mainData[index].last_block_produced = this.producersSavedInfo[element.owner].lastBlockProduced;
                this.mainData[index].last_time_produced = this.producersSavedInfo[element.owner].lastTimeProduced;
              }
            });
          }
          this.blockChainInfo = global.rows[0];
          this.totalProducerVoteWeight = producers.total_producer_vote_weight;
          this.supply = Number(stat.rows[0].supply.replace(/[^0-9.-]+/g, ""));
          this.rotations = rotations.rows[0];
          this.rotations.last_rotation_time = new Date(Date.parse(this.rotations.last_rotation_time + 'Z'));
          this.rotations.next_rotation_time = new Date(Date.parse(this.rotations.next_rotation_time + 'Z'));
          // this.voteProgression = (this.blockChainInfo.total_activated_stake / 10000 / this.supply * 100).toFixed(2);

          let ELEMENT_DATA: Element[] = this.MainService.countRate(this.swapAndLabelProducers(this.mainData, this.rotations), this.totalProducerVoteWeight, this.supply);
          this.putProducersOnMap(producers.list);this.dataSource = new MatTableDataSource<Element>(ELEMENT_DATA);

          this.dataSource.filterPredicate = (data, filter) => data.owner.toLowerCase().indexOf(filter) > -1 || data.votes.toLowerCase().indexOf(filter) > -1;
          this.spinner = false;

          this.nextRotation$ = Observable.interval(1000).map((x) => {
            return Math.floor((new Date(this.rotations.next_rotation_time).getTime() - new Date().getTime()) / 1000);
          });
          this.nextRotation$.subscribe((x) => {
            this.nextRotationMessage = this.dhms(x);
          });
        },
        (error) => {
          console.error(error);
          this.spinner = false;
        });
  }

  setProducingInfo() {
    if (this.dataSource) {
      if (!this.firstBlockProduced) {
        this.firstBlockProduced = this.blockChainInfo.head_block_num;
      }
      if(this._reverseMap[this.blockChainInfo.head_block_producer] !== this.lastProducerIndex){
        const index = this._reverseMap[this.blockChainInfo.head_block_producer];
        const producer = this.dataSource.data[index];

        if (this.lastProducerIndex !== -1) {
          const prod = this.dataSource.data[this.lastProducerIndex];
          prod.producing = false;
          prod.label = prod.label.replace('+', '');
          if(prod.mapNode){
            prod.mapNode.setStyle({"color": this._colors[prod.label] || this._colors.Producing});
            prod.mapNode.closePopup();
          }
        }
        this.lastProducerIndex = index;
          const prod = this.dataSource.data[index];
          prod.producing = true;
          prod.label = "+" + prod.label
          if(prod.mapNode){
            prod.mapNode.setStyle({"color": this._colors.Producing});
            prod.mapNode.openPopup();
          }
          prod.last_block_produced = this.blockChainInfo.head_block_num;
          prod.last_time_produced = new Date().getTime();
          this.producersSavedInfo[producer.owner] = { 'lastBlockProduced': prod.last_block_produced, 'lastTimeProduced': prod.last_time_produced };
      }
    }
  }

  swapAndLabelProducers(data, rotation) {
    var a, b;
    var totalActive = 0, totalStandby = 0;
    this.rotationMark = {};
    for (var index = 0; index < data.length; index++) {
      let element = data[index];
      element.index = index + 1;

      if (element.owner === rotation.bp_currently_out) {
      // if (index === rotation.bp_out_index) {
        a = index;
        element.label = 'Standby';
        element.nextRotationTime = new Date(this.rotations.next_rotation_time).getTime();
        totalStandby += 1;
        this._reverseMap[element.owner] = index;
        this.rotationMark[a+1] = true;
      } else if (element.owner === rotation.sbp_currently_in) {
      // } else if (index === rotation.sbp_in_index) {
        b = index;
        element.label = 'Active';
        element.nextRotationTime = new Date(this.rotations.next_rotation_time).getTime();
        totalActive += 1;
        this._reverseMap[element.owner] = index;
        this.rotationMark[b+1] = true;
      }
      if (!element.is_active) {
        element.label = 'Inactive';
      } else if(!element.label){
        if (element.active) {
          element.label = 'Active';
          this._reverseMap[element.owner] = index;
          totalActive += 1;
        } else if (index <= 50) {
          element.label = 'Standby';
          this._reverseMap[element.owner] = index;
          totalStandby += 1;
        } else {
          element.label = 'Candidate';
        }
      }
    }

    /**
     * x = next time from rotation table = new Date(this.rotations.next_rotation_time).getTime()
     * y = this.ROTATION_INTERVAL = 6hrs
     * z = number of intervals for current position = (pos - this.rotations.bp_out_index + (<any>(pos < this.rotations.bp_out_index) * (totalActive - 1))
     * x + y * z = next rotation time for current position
     * 
     * pos = current position without the rotated member = if (i < a) then i else i-1   (a = current position for rotated member)
     * this.rotations.bp_out_index = last position for rotated member
     * (pos < this.rotations.bp_out_index) * (totalActive - 1) = if (pos < bp_out_index) then (totalActive - 1) else 0
     */

    let pos = 0;
    for (var i = 0; i < totalActive; i++) {
      if (i === a)
        continue;
      data[i].nextRotationTime = new Date(this.rotations.next_rotation_time).getTime() + this.ROTATION_INTERVAL * (pos - this.rotations.bp_out_index + (<any>(pos < this.rotations.bp_out_index) * (totalActive - 1)));
      pos++;
    }

    pos = totalActive;
    for (var i = totalActive; i < totalStandby + totalActive; i++) {
      if (i === b)
        continue;
      data[i].nextRotationTime = new Date(this.rotations.next_rotation_time).getTime() + this.ROTATION_INTERVAL * (pos - this.rotations.sbp_in_index + (<any>(pos < this.rotations.sbp_in_index) * (totalStandby - 1)));
      pos++;
    }

    let swap = data[a];
    data[a] = data[b];
    data[b] = swap;
    
    swap = this._reverseMap[rotation.bp_currently_out];
    this._reverseMap[rotation.bp_currently_out] = this._reverseMap[rotation.sbp_currently_in];
    this._reverseMap[rotation.sbp_currently_in] = swap;

    return data;
  }


  applyFilter(filterValue: string) {
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  dhms(t) {
    if (t === 0) {
      return '-';
    }
    var days, hours, minutes, seconds, timer = '';
    days = Math.floor(t / 86400);
    t -= days * 86400;
    hours = Math.floor(t / 3600) % 24;
    t -= hours * 3600;
    minutes = Math.floor(t / 60) % 60;
    t -= minutes * 60;
    seconds = t % 60;

    if (days > 0) {
      timer += days + 'd ';
    }
    if (hours) {
      timer += hours + 'h ';
    }
    if (minutes) {
      timer += minutes + 'm ';
    }
    if (seconds) {
      timer += seconds + 's';
    }

    return timer;
  }
}







